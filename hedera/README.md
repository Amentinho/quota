# hedera

HTS scripts using `@hashgraph/sdk` (Layer 1): token creation, mint, retire (transfer + freeze), transformation. Day 1: token creation + invariant proof scripts only.

Run from the repo root so `--env-file` finds `.env`:

```
node --env-file=.env hedera/create-token.mjs
```
