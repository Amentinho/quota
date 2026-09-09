# scripts

`relayer.mjs` — the synchronous relayer. Performs a Hedera operation, then anchors the matching event on `QuotaAnchor` (Sepolia). No queue, no retries: if the Hedera leg succeeds and the anchor leg fails, it logs loudly and exits non-zero rather than hiding the mismatch.

On every invocation, before doing anything else, it also checks the retirement-account tripwire for both the harvest and kernel seasons (see CLAUDE.md, "Making retirement permanent" and Trust boundaries — this is an opportunistic check, not the actual detector, which is the off-chain mint reconciler below; retirement outflows have no full-history equivalent yet, see Trust boundaries in the README).

```
node --env-file=../.env relayer.mjs open-season
node --env-file=../.env relayer.mjs open-kernel-season
node --env-file=../.env relayer.mjs mint <grams> <lotRef> [certifierAddress]
node --env-file=../.env relayer.mjs transfer <grams>
node --env-file=../.env relayer.mjs transform <inputGrams> <outputGrams> <lotRef> [productType=kernel]
node --env-file=../.env relayer.mjs retire <grams> <lotRef>
node --env-file=../.env relayer.mjs retire-kernel <grams> <lotRef>
node --env-file=../.env relayer.mjs register-participant <address> <role>
node --env-file=../.env relayer.mjs reconcile-mints
```

`reconcile-mints` is the actual mint detector's bridge into the subgraph (subgraph mappings can't call the Hedera mirror node directly — see CLAUDE.md, "Bridging Hedera mirror-node data into the subgraph"): it fetches full Hedera mint history for the token, fetches full `UnitsMinted` anchor history from every `QuotaAnchor` address ever deployed (each queried with the ABI it actually emits — see the gotcha on event-signature drift in CLAUDE.md), and anchors `UnauthorizedMintDetected` for anything unmatched. Run it any time; it's idempotent in the sense that anything already matched stays matched, but it does write a new anchor event for every unmatched mint on every run, so don't run it repeatedly against a known, already-anchored discrepancy expecting it to go quiet on its own — anchoring the finding is the point.

`mint` now takes a required `lotRef` — a lot's identity is assigned at harvest mint, not retirement (v7). `transfer` moves grams from the operator to a deterministic processor account (custody in transit, ahead of transformation) and anchors `UnitsTransferred`; it is not lot-attributed at the contract level, so the anchor doesn't take a `lotRef`.

`transform` is the ceiling-checked transformation step: it calls `recordTransform` on Sepolia *first* (which reads the yield ratio live from the input season's ENS record and reverts if `outputGrams` exceeds what that ratio permits) before touching any real Hedera balance — a bad claim fails cleanly with nothing to unwind. Only once that succeeds does it run the real Hedera legs: input grams retired (processor → the harvest retirement account, signed with the deterministic processor key, not burned) and output grams minted fresh on the kernel token — then anchors both. `retire` and `retire-kernel` each do a real Hedera transfer to their respective retirement account first, then anchor `recordRetirement` with that transfer's own Hedera tx ID — same do-the-Hedera-leg-first-then-anchor-what-actually-happened pattern as `mint`, never anchoring a claim the ledger doesn't back. `register-participant` anchors `ParticipantRegistered` directly — no Hedera leg, since registration is a Sepolia-only accountability record.

`mint-bypassing-relayer.mjs` — mints directly via the Hedera SDK, skipping the relayer and leaving no Sepolia anchor. A permanent testing tool (not a throwaway script), used to prove the reconciler actually catches a genuinely unauthorized mint rather than just asserting it would.

Seed data generators for three consortia (Bronte pistachio + two more TBD), used to demonstrate one shared subgraph schema across multiple consortia, are not yet built — one real consortium (Bronte, two seasons) has been run end to end instead; see CLAUDE.md.
