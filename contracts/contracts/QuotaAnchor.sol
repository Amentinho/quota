// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Authorization record and event source for QUOTA. Stores as little
/// as possible on purpose: the real state (token supply, retirement
/// balances) lives on Hedera; this contract exists so a subgraph can index
/// what was supposed to happen and compare it against what actually did.
contract QuotaAnchor {
    address public immutable relayer;

    event SeasonOpened(
        bytes32 indexed consortiumId,
        uint256 year,
        uint256 capGrams,
        string hederaTokenId,
        bytes32 ensNode
    );

    event UnitsMinted(bytes32 indexed seasonId, address indexed to, uint256 grams, string hederaTxId);

    event UnitsTransferred(bytes32 indexed seasonId, address indexed from, address indexed to, uint256 grams);

    event Transformed(
        bytes32 indexed inputSeasonId,
        uint256 inputGrams,
        bytes32 indexed outputSeasonId,
        uint256 outputGrams,
        string productType,
        uint16 yieldBp
    );

    event UnitsRetired(bytes32 indexed seasonId, uint256 grams, string lotRef, string hederaTxId);

    event ParticipantRegistered(address indexed addr, string role);

    /// @notice A retirement account paid out grams it should only ever have
    /// received. Anchored by the relayer when it notices the account's
    /// Hedera balance is lower than the sum of grams anchored via
    /// UnitsRetired for it — evidence for the subgraph detector, not a
    /// promise this catches an outflow the moment it happens (see CLAUDE.md).
    event RetirementOutflowDetected(bytes32 indexed seasonId, uint256 grams, string hederaTxId);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "QuotaAnchor: caller is not the relayer");
        _;
    }

    constructor(address _relayer) {
        relayer = _relayer;
    }

    function openSeason(
        bytes32 consortiumId,
        uint256 year,
        // TODO(ENS): capGrams must come from the season's ENS resolver text
        // record (quota.cap.g) once Layer 3 exists. Until then it is
        // caller-supplied and NOT enforced by this contract -- it is
        // recorded, not authoritative. Do not let this parameter quietly
        // become the permanent source of truth.
        uint256 capGrams,
        string calldata hederaTokenId,
        bytes32 ensNode
    ) external onlyRelayer {
        emit SeasonOpened(consortiumId, year, capGrams, hederaTokenId, ensNode);
    }

    function recordMint(bytes32 seasonId, address to, uint256 grams, string calldata hederaTxId) external onlyRelayer {
        emit UnitsMinted(seasonId, to, grams, hederaTxId);
    }

    function recordTransfer(bytes32 seasonId, address from, address to, uint256 grams) external onlyRelayer {
        emit UnitsTransferred(seasonId, from, to, grams);
    }

    function recordTransform(
        bytes32 inputSeasonId,
        uint256 inputGrams,
        bytes32 outputSeasonId,
        uint16 yieldBp,
        string calldata productType
    ) external onlyRelayer {
        require(yieldBp <= 10000, "QuotaAnchor: yieldBp exceeds 10000");
        // Floor division, always -- rounding up would create units from nothing.
        uint256 outputGrams = (inputGrams * yieldBp) / 10000;
        emit Transformed(inputSeasonId, inputGrams, outputSeasonId, outputGrams, productType, yieldBp);
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

    function registerParticipant(address addr, string calldata role) external onlyRelayer {
        emit ParticipantRegistered(addr, role);
    }
}
