# hedera

HTS scripts using `@hashgraph/sdk` (Layer 1): token creation, mint, retire (transfer + freeze), transformation. Currently implemented: token creation, the mint invariant-proof scripts, and the retirement mechanism below; transformation is not yet built.

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

Retirement mechanism (the actual "retire" flow, built from what 4c proved was necessary), run in this order:

```
node --env-file=.env hedera/create-retirement-account.mjs      # one-time: creates the account, associates the token, grants KYC
node --env-file=.env hedera/retire.mjs 50000                   # transfer <grams> from treasury to the retirement account
node --env-file=.env hedera/freeze-retirement-account.mjs      # freeze it — units can no longer leave
node --env-file=.env hedera/prove-retirement-immutable.mjs     # attempt an outbound transfer — expect rejection
```

Retirement account `0.0.10421765` is already created, holds 50,000 grams, and is frozen on `0.0.10411251` — see CLAUDE.md. Note the freeze blocks transfers in both directions: further retirements into this specific account would need the `freezeKey` to unfreeze it first. Whether production reuses one retirement account per season (unfreeze, transfer, refreeze) or freezes per-lot is an open design question — see CLAUDE.md.
