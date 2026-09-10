// Same story as KNOWN_SEASONS: the subgraph stores raw bytes32 ids, not
// display names -- there is no on-chain name to read back. A small local
// map is the honest way to show something readable, not a claim that
// names are derivable from the id.
const KNOWN_CONSORTIA: Record<string, string> = {
  "0x15b5c6738cfb5e2b01ba96ceeaa44f6d9c1f657b4f24f5df918008069f036c4c": "Bronte",
};

const KNOWN_SEASON_NAMES: Record<string, string> = {
  "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46": "2026 harvest",
  "0xa3a9424b15d3b3de2818cd4323cc8839989fa5deb7659db78756e4e1561a08d1": "2026 kernel",
};

export function consortiumLabel(id: string): string {
  return KNOWN_CONSORTIA[id.toLowerCase()] ?? id;
}

export function seasonLabel(id: string): string {
  return KNOWN_SEASON_NAMES[id.toLowerCase()] ?? id;
}

// Presentation only, same story as the two maps above: an address has no
// on-chain reverse record pointing back to a name, so "which ENS name
// resolves to this address" isn't something to look up, it's something we
// already know because we're the ones who registered it (see
// ens/register-subname.mjs + ens/set-addr-record.mjs). The role checks
// this project actually authorizes against (hasRoles on the season
// resource) never consult these names or this map -- an address not in
// here just renders as an address, same as before this existed.
const KNOWN_ROLE_NAMES: Record<string, string> = {
  "0x2006deb6e0e8ed48e2b2afaf463ae3e480b9e375": "approver.bronte.quota.eth",
  "0x7dfdd0fd40a1e4208bce04ac534b493ec4627ec6": "issuer-1.bronte.quota.eth",
  "0x1bea120ffdc00b26acb8357838e7eebae8464edb": "issuer-2.bronte.quota.eth",
};

export function roleName(address: string): string | null {
  return KNOWN_ROLE_NAMES[address.toLowerCase()] ?? null;
}

// The subgraph correctly flags every Hedera mint with no matching anchor --
// but "unanchored" doesn't distinguish intent. These three are the only
// findings that exist today; classified here from what we know about how
// each one actually happened (see CLAUDE.md), not derivable from on-chain
// data alone. A finding not in this map renders with no classification
// badge, rather than guessing.
export type DetectorFindingKind = "intentional-demo" | "pre-season-open";

const KNOWN_FINDING_KINDS: Record<string, DetectorFindingKind> = {
  "0.0.10323351-1788884980-415990532": "intentional-demo",
  "0.0.10323351-1788942883-550678980": "pre-season-open",
  "0.0.10323351-1788942893-476657317": "pre-season-open",
};

export function detectorFindingKind(hederaTxId: string): DetectorFindingKind | null {
  return KNOWN_FINDING_KINDS[hederaTxId] ?? null;
}
