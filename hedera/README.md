# hedera

HTS scripts using `@hashgraph/sdk` (Layer 1): token creation, mint, retire, transformation. Currently implemented: token creation, the mint invariant-proof scripts, and the retirement mechanism below; transformation is not yet built.

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

**Retirement mechanism.** A retirement account has to be permanently unable to send anything out. Three approaches were tested against the live token — see CLAUDE.md ("Making retirement permanent") and the README for the full evidence and why two of them were rejected:

```
node --env-file=.env hedera/investigate-unspendable-key.mjs             # option 1, rejected: Hedera won't create an unsignable account (KEY_REQUIRED / INVALID_ADMIN_KEY)
node --env-file=.env hedera/create-discarded-key-retirement-account.mjs # option 3, adopted: ephemeral key, used once for association, then discarded
node --env-file=.env hedera/retire.mjs 50000                            # transfer <grams> from treasury into any retirement account (used for all three options)
```

Canonical retirement account: `0.0.10422087` (`HEDERA_RETIREMENT_ACCOUNT_ID` in `.env`) — no private key stored, by design.

The freeze-based approach (option 2) worked but was dropped for design reasons, not because it failed — kept in the repo as a proven, superseded prototype:

```
node --env-file=.env hedera/create-retirement-account.mjs      # creates the account, associates the token, grants KYC
node --env-file=.env hedera/freeze-retirement-account.mjs      # freeze it — units can no longer leave
node --env-file=.env hedera/prove-retirement-immutable.mjs     # attempt an outbound transfer — expect rejection
```

That account (`0.0.10421765`, `HEDERA_DEPRECATED_FROZEN_RETIREMENT_ACCOUNT_ID`/`_KEY` in `.env`) still holds 50,000 grams, frozen — not migrated, since freezing already made it permanently immobile too, just via the mechanism the product no longer uses for new retirements.

Each consortium-season is meant to get its own retirement account under the adopted mechanism — see CLAUDE.md for what's still manual about that.
