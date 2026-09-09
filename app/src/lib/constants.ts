// Public endpoints only. The Sepolia RPC is a public, keyless endpoint
// (ethereum-sepolia-rpc.publicnode.com) -- deliberately so, since anything
// in this client bundle is public by definition. Never put a keyed RPC
// (Alchemy/Infura) here.
export const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1758548/quota/v0.0.2";
export const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const ENS_BRONTE_REGISTRY_ADDRESS = "0xC987633C2b28e4D03aa14486ef0627dC3555E54b";
export const ENS_RESOLVER_ADDRESS = "0x2EF5C95979534a53cd31F074c7Ea36DCA3813274";
export const QUOTA_ANCHOR_ADDRESS = "0x13A0Bb73C5a629dF1a8c91F99213d6077cc1acE2";

export const MINTER_ROLE = 1n << 40n;

// The subgraph stores an ENS node (a namehash, bytes32) per season, not the
// human-readable label -- a namehash can't be reversed back into a string.
// So "which ENS label does this season correspond to" is a small local
// lookup, not something the subgraph or ENS itself can answer. Extended
// here the same way scripts/relayer.mjs's own SEASON_ID/SEASON_LABEL
// constants are: "known today because there's a small, fixed set of
// seasons; becomes a real lookup once this grows."
export const KNOWN_SEASONS: { seasonId: string; label: string; name: string }[] = [
  { seasonId: "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46", label: "2026", name: "2026.bronte.quota.eth" },
  { seasonId: "0xa3a9424b15d3b3de2818cd4323cc8839989fa5deb7659db78756e4e1561a08d1", label: "kernel-2026", name: "kernel-2026.bronte.quota.eth" },
];

export const TEXT_RECORD_KEYS = [
  "quota.unit",
  "quota.cap.g",
  "quota.token.hedera",
  "quota.yield.kernel.bp",
  "quota.yield.cream.bp",
];

// Conservative lower bound covering every EACRolesChanged event this
// registry has ever emitted (root registration through the kernel-2026
// re-registration) -- see CLAUDE.md for the deploy history this spans.
export const ENS_EVENTS_START_BLOCK = 11661000;
