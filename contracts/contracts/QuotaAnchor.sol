// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal read-only interface onto the ENSv2 PermissionedRegistry
/// functions QuotaAnchor needs. getResolver(label) is expiry-gated
/// directly by the registry (returns address(0) once expired) --
/// confirmed against verified source. hasRoles(tokenId, ...) is ALSO
/// expiry-gated, but indirectly: the registry shifts the resource to
/// eacVersionId + 1 once expired, a version nothing was ever granted a
/// role on. Both checks are made anyway, separately, for legibility --
/// see CLAUDE.md ("Making retirement permanent" / Layer 3) for the full
/// story of getting this wrong on first read and how it was caught.
interface IEnsRegistry {
    function getResolver(string calldata label) external view returns (address);
    function findTokenId(string calldata label) external view returns (uint256);
    function hasRoles(uint256 anyId, uint256 roleBitmap, address account) external view returns (bool);
}

interface IEnsTextResolver {
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/// @notice Authorization record and event source for QUOTA. Stores as little
/// as possible on purpose: the real state (token supply, retirement
/// balances) lives on Hedera; this contract exists so a subgraph can index
/// what was supposed to happen and compare it against what actually did.
contract QuotaAnchor {
    address public immutable relayer;

    /// @dev Custom EAC role bit, not part of ENSv2's own RegistryRolesLib --
    /// placed on nybble 10, which RegistryRolesLib leaves unused. Must match
    /// ens/roles.mjs MINTER_ROLE exactly.
    uint256 public constant MINTER_ROLE = 1 << 40;

    struct SeasonEnsConfig {
        address parentRegistry; // registry holding this season's label (e.g. bronte.quota.eth's registry)
        string label; // e.g. "2026"
        address resolver;
        bytes32 node; // namehash of the full season name, for reading text records
    }

    /// @dev The only per-season state this contract keeps: where to look on
    /// ENS. Set once at openSeason, read (never re-supplied by the caller)
    /// on every subsequent mint -- the minimum needed to avoid trusting
    /// whichever address happens to call recordMint to also tell us which
    /// ENS records apply.
    mapping(bytes32 => SeasonEnsConfig) public seasonEns;

    event SeasonOpened(
        bytes32 indexed seasonId,
        bytes32 indexed consortiumId,
        uint256 year,
        uint256 capGrams,
        string hederaTokenId,
        bytes32 ensNode
    );

    event UnitsMinted(bytes32 indexed seasonId, address indexed to, uint256 grams, string hederaTxId, string lotRef);

    event UnitsTransferred(bytes32 indexed seasonId, address indexed from, address indexed to, uint256 grams);

    /// @dev yieldBp is emitted for audit visibility but is never caller-
    /// supplied -- recordTransform reads it live from the input season's ENS
    /// resolver on every call (see recordTransform), so what's emitted here
    /// is always what the contract itself just read and enforced, not a
    /// claim passed in by whoever called it.
    event Transformed(
        bytes32 indexed inputSeasonId,
        uint256 inputGrams,
        bytes32 indexed outputSeasonId,
        uint256 outputGrams,
        string productType,
        uint256 yieldBp,
        string lotRef
    );

    event UnitsRetired(bytes32 indexed seasonId, uint256 grams, string lotRef, string hederaTxId);

    event ParticipantRegistered(bytes32 indexed consortiumId, address indexed addr, string role);

    /// @notice A retirement account paid out grams it should only ever have
    /// received. Anchored by the relayer when it notices the account's
    /// Hedera balance is lower than the sum of grams anchored via
    /// UnitsRetired for it — evidence for the subgraph detector, not a
    /// promise this catches an outflow the moment it happens (see CLAUDE.md).
    event RetirementOutflowDetected(bytes32 indexed seasonId, uint256 grams, string hederaTxId);

    /// @notice A Hedera mint transaction exists with no matching UnitsMinted
    /// anchor event. Anchored by an off-chain reconciler that compares full
    /// Hedera mirror-node mint history against this contract's own
    /// UnitsMinted history — subgraphs can't call the mirror node directly
    /// (mapping handlers are deterministic, no outbound HTTP), so this event
    /// is the bridge: the reconciler is the actual detector, this contract
    /// and the subgraph downstream of it just make the finding queryable.
    event UnauthorizedMintDetected(bytes32 indexed seasonId, uint256 grams, string hederaTxId);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "QuotaAnchor: caller is not the relayer");
        _;
    }

    constructor(address _relayer) {
        relayer = _relayer;
    }

    function openSeason(
        bytes32 seasonId,
        bytes32 consortiumId,
        uint256 year,
        address parentRegistry,
        string calldata label,
        address resolver,
        bytes32 node,
        string calldata hederaTokenId
    ) external onlyRelayer {
        seasonEns[seasonId] = SeasonEnsConfig(parentRegistry, label, resolver, node);

        // Cap read from ENS, not caller-supplied: the name is the source of
        // truth, not this contract and not whoever calls it.
        uint256 capGrams = _parseUint(IEnsTextResolver(resolver).text(node, "quota.cap.g"));
        require(capGrams > 0, "QuotaAnchor: quota.cap.g not set on resolver");

        emit SeasonOpened(seasonId, consortiumId, year, capGrams, hederaTokenId, node);
    }

    function recordMint(
        bytes32 seasonId,
        address to,
        uint256 grams,
        string calldata hederaTxId,
        address certifier,
        string calldata lotRef
    ) external onlyRelayer {
        SeasonEnsConfig storage cfg = seasonEns[seasonId];
        require(cfg.resolver != address(0), "QuotaAnchor: unknown season");

        // 1. Does the season name currently resolve? Expiry-gated by the
        // registry itself -- this is the whole mint window, no timer here.
        require(
            IEnsRegistry(cfg.parentRegistry).getResolver(cfg.label) != address(0),
            "QuotaAnchor: season does not resolve"
        );

        // 2. Does the certifier hold MINTER on this season's resource?
        // Checked separately because hasRoles is not itself expiry-gated --
        // this is a role check, not a second expiry check.
        uint256 tokenId = IEnsRegistry(cfg.parentRegistry).findTokenId(cfg.label);
        require(
            IEnsRegistry(cfg.parentRegistry).hasRoles(tokenId, MINTER_ROLE, certifier),
            "QuotaAnchor: certifier lacks MINTER role for this season"
        );

        emit UnitsMinted(seasonId, to, grams, hederaTxId, lotRef);
    }

    function recordTransfer(bytes32 seasonId, address from, address to, uint256 grams) external onlyRelayer {
        emit UnitsTransferred(seasonId, from, to, grams);
    }

    /// @notice Records a transformation of inputGrams (input season/lot) into
    /// a caller-claimed outputGrams (output season/lot), enforced against a
    /// yield ceiling read live from ENS -- never caller-supplied, never
    /// hardcoded. Reverts if the claim exceeds what the input season's own
    /// ENS text record (quota.yield.<productType>.bp) permits, floor-divided
    /// the same way every other conversion in this contract is: rounding up
    /// would create units from nothing.
    function recordTransform(
        bytes32 inputSeasonId,
        uint256 inputGrams,
        bytes32 outputSeasonId,
        uint256 outputGrams,
        string calldata productType,
        string calldata lotRef
    ) external onlyRelayer {
        SeasonEnsConfig storage cfg = seasonEns[inputSeasonId];
        require(cfg.resolver != address(0), "QuotaAnchor: unknown input season");

        uint256 yieldBp = _parseUint(
            IEnsTextResolver(cfg.resolver).text(cfg.node, string.concat("quota.yield.", productType, ".bp"))
        );
        uint256 maxOutputGrams = (inputGrams * yieldBp) / 10000;
        require(outputGrams <= maxOutputGrams, "QuotaAnchor: output exceeds yield ceiling");

        emit Transformed(inputSeasonId, inputGrams, outputSeasonId, outputGrams, productType, yieldBp, lotRef);
    }

    function recordRetirement(
        bytes32 seasonId,
        uint256 grams,
        string calldata lotRef,
        string calldata hederaTxId
    ) external onlyRelayer {
        emit UnitsRetired(seasonId, grams, lotRef, hederaTxId);
    }

    function recordRetirementOutflow(
        bytes32 seasonId,
        uint256 grams,
        string calldata hederaTxId
    ) external onlyRelayer {
        emit RetirementOutflowDetected(seasonId, grams, hederaTxId);
    }

    function registerParticipant(bytes32 consortiumId, address addr, string calldata role) external onlyRelayer {
        emit ParticipantRegistered(consortiumId, addr, role);
    }

    function recordUnauthorizedMint(
        bytes32 seasonId,
        uint256 grams,
        string calldata hederaTxId
    ) external onlyRelayer {
        emit UnauthorizedMintDetected(seasonId, grams, hederaTxId);
    }

    /// @dev Plain decimal integer string to uint256. ENS text records for
    /// cap/yield are integers-as-strings on purpose (no float parsing,
    /// ever) -- this just walks the digits.
    function _parseUint(string memory s) internal pure returns (uint256 result) {
        bytes memory b = bytes(s);
        require(b.length > 0, "QuotaAnchor: empty ENS text value");
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            require(c >= 48 && c <= 57, "QuotaAnchor: non-digit in ENS text value");
            result = result * 10 + (c - 48);
        }
    }
}
