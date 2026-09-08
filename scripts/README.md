# scripts

`relayer.mjs` — the synchronous relayer. Performs a Hedera operation, then anchors the matching event on `QuotaAnchor` (Sepolia). No queue, no retries: if the Hedera leg succeeds and the anchor leg fails, it logs loudly and exits non-zero rather than hiding the mismatch — that discrepancy is exactly what the subgraph detector is meant to catch once it exists.

On every invocation, before doing anything else, it also checks the retirement-account tripwire (see CLAUDE.md, "Making retirement permanent" and Trust boundaries — this is an opportunistic check, not the actual detector, which is the subgraph).

```
node --env-file=../.env relayer.mjs open-season
node --env-file=../.env relayer.mjs mint <grams>
```

`transfer`, `retire`, `transform`, and `registerParticipant` are not yet wired up — the contract functions exist, the relayer doesn't call them yet.

Seed data generators for three consortia (Bronte pistachio + two more TBD), used to demonstrate one shared subgraph schema across multiple consortia, are not yet built either.
