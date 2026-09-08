# scripts

`relayer.mjs` — the synchronous relayer. Performs a Hedera operation, then anchors the matching event on `QuotaAnchor` (Sepolia). No queue, no retries: if the Hedera leg succeeds and the anchor leg fails, it logs loudly and exits non-zero rather than hiding the mismatch.

On every invocation, before doing anything else, it also checks the retirement-account tripwire (see CLAUDE.md, "Making retirement permanent" and Trust boundaries — this is an opportunistic check, not the actual detector, which is the off-chain reconciler below).

```
node --env-file=../.env relayer.mjs open-season
node --env-file=../.env relayer.mjs mint <grams> [certifierAddress]
node --env-file=../.env relayer.mjs reconcile-mints
```

`reconcile-mints` is the actual mint detector's bridge into the subgraph (subgraph mappings can't call the Hedera mirror node directly — see CLAUDE.md, "Bridging Hedera mirror-node data into the subgraph"): it fetches full Hedera mint history for the token, fetches full `UnitsMinted` anchor history from every `QuotaAnchor` address ever deployed, and anchors `UnauthorizedMintDetected` for anything unmatched. Run it any time; it's idempotent in the sense that anything already matched stays matched, but it does write a new anchor event for every unmatched mint on every run, so don't run it repeatedly against a known, already-anchored discrepancy expecting it to go quiet on its own — anchoring the finding is the point.

`transfer`, `retire`, `transform`, and `registerParticipant` are not yet wired up — the contract functions exist, the relayer doesn't call them yet.

`mint-bypassing-relayer.mjs` — mints directly via the Hedera SDK, skipping the relayer and leaving no Sepolia anchor. A permanent testing tool (not a throwaway script), used to prove the reconciler actually catches a genuinely unauthorized mint rather than just asserting it would.

Seed data generators for three consortia (Bronte pistachio + two more TBD), used to demonstrate one shared subgraph schema across multiple consortia, are not yet built.
