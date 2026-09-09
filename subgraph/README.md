# subgraph

One shared schema (`schema.graphql`) indexing `QuotaAnchor` on Ethereum Sepolia — the same entities, same query shape, for any consortium. Studio project slug: `quota`.

This subgraph does not talk to Hedera. It can't: subgraph mappings are deterministic and can't make outbound HTTP calls, so there's no way for a mapping to reach the Hedera mirror node directly. The actual reconciliation against Hedera mirror-node history happens off-chain, in `scripts/relayer.mjs`'s `reconcile-mints` command (and the retirement tripwire before it) — those anchor their findings as `UnauthorizedMintDetected`/`RetirementOutflowDetected` events on Sepolia, and this subgraph indexes *those*. See CLAUDE.md ("bridging Hedera mirror-node data into the subgraph") for the full reasoning.

```
npx graph codegen
npx graph build
npx graph auth <deploy key>
npx graph deploy quota
```

All four succeed. Live endpoint: **`https://api.studio.thegraph.com/query/1758548/quota/v0.0.1`**. A judge needs only that URL — no API key, no wallet, no local setup — to run the three example queries in the top-level README against real indexed data. Check `{ _meta { block { number } hasIndexingErrors } }` first if the numbers look stale; it should be within a few blocks of Sepolia's current head, with `hasIndexingErrors: false`.

## Schema

Six required entities (`Consortium`, `Season`, `Participant`, `Lot`, `Transformation`, `Retirement`) plus two detector entities (`UnauthorizedMint`, `UnauthorizedRetirementOutflow`). Nothing in the schema is consortium-specific — `Season`, `Participant`, `Lot`, etc. all key off a `consortium: Consortium!` (or an indirect path to one), so the same query works for any consortium by changing only the id. Bronte is the only consortium with real data today; the schema doesn't assume that.

`Season`'s `mintedGrams`/`retiredGrams`/`inCirculationGrams`/`utilisationBp` are computed in the mapping (`src/mapping.ts`) on every relevant event, not left to query-time aggregation.

## Mint reconciliation, run and verified

`scripts/relayer.mjs reconcile-mints` fetches full Hedera mint history for the token, fetches full `UnitsMinted` anchor history from every `QuotaAnchor` address this project has ever deployed (not just the current one — redeploys fragment history across addresses), and anchors `UnauthorizedMintDetected` for anything unmatched.

Two real bugs surfaced by actually running this, both fixed before the current result stood: comparing against only the current contract's history (false positives on everything anchored pre-redeploy), and a non-global `.replace()` in the transaction-ID normalizer that silently failed to canonicalize either ID format. See CLAUDE.md for the detail.

Verified clean: one legitimate mint through the relayer (anchored) plus one deliberate mint via `scripts/mint-bypassing-relayer.mjs` (bypasses the relayer/anchor entirely, simulating a real unauthorized mint) — the reconciler flagged exactly the bypass mint and correctly recognized every legitimately-anchored mint across three different historical contract addresses.
