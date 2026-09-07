# hedera

HTS scripts using `@hashgraph/sdk` (Layer 1): token creation, mint, retire (transfer + freeze), transformation. Day 1: token creation + invariant proof scripts only.

Run from the repo root so `--env-file` finds `.env`:

```
node --env-file=.env hedera/create-token.mjs
```

Token `0.0.10411251` (QUOTA Bronte PDO Pistachio 2026 / QBRP26) is live on testnet — see CLAUDE.md. Invariant proof, run in this exact order (each depends on the last transaction's on-chain state):

```
node --env-file=.env hedera/4a-mint-to-cap.mjs        # mint 3,400,000,000 grams — expect SUCCESS
node --env-file=.env hedera/4b-mint-one-more.mjs      # mint 1 more — expect rejection, prints status code
node --env-file=.env hedera/4c-burn-then-remint.mjs   # burn 100,000, then try minting 1 — the retire-vs-burn evidence
```
