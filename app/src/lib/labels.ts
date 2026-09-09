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
