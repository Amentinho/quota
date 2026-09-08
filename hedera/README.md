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

**Retirement mechanism.** The security property that matters: a retirement account's key must not be a secret anyone has to trust us about, because an unverifiable "we deleted it" claim doesn't belong in a project about removing trust assumptions. Four approaches were tested against the live token — full evidence, status codes, and rejection reasons in CLAUDE.md ("Making retirement permanent") and the README:

```
node --env-file=.env hedera/investigate-unspendable-key.mjs                  # rejected: Hedera won't create an unsignable account (KEY_REQUIRED / INVALID_ADMIN_KEY)
node --env-file=.env hedera/investigate-post-association-unspendable.mjs     # rejected: same result rekeying an associated account via AccountUpdateTransaction
node --env-file=.env hedera/create-deterministic-retirement-account.mjs      # adopted: key derived from sha256("QUOTA-RETIREMENT-" + tokenId), published, not secret
node --env-file=.env hedera/retire.mjs <grams>                               # transfer grams from treasury into any retirement account
```

Canonical retirement account: `0.0.10422283` (`HEDERA_RETIREMENT_ACCOUNT_ID` in `.env`) — no private key stored; none needs protecting, since it's re-derivable by anyone from the token ID.

Two approaches worked mechanically but were rejected anyway — kept in the repo as proven, superseded prototypes, not deleted:

```
node --env-file=.env hedera/create-retirement-account.mjs               # freeze-based: creates the account, associates, grants KYC
node --env-file=.env hedera/freeze-retirement-account.mjs               # freeze it — rejected: bidirectional, reversible until frozen
node --env-file=.env hedera/prove-retirement-immutable.mjs              # attempt outbound transfer — expect rejection

node --env-file=.env hedera/create-discarded-key-retirement-account.mjs # discarded-key: works, rejected on principle — unverifiable claim
```

- `0.0.10421765` (`HEDERA_DEPRECATED_FROZEN_RETIREMENT_ACCOUNT_ID`/`_KEY` in `.env`) — 50,000 grams, frozen.
- `0.0.10422087` (`HEDERA_DEPRECATED_DISCARDEDKEY_RETIREMENT_ACCOUNT_ID` in `.env`, no key stored) — 1 gram.

Neither was migrated: both are already permanently immobile, just via mechanisms the product no longer uses for new retirements.

Each consortium-season is meant to get its own retirement account, deterministically derived from that season's token ID — see CLAUDE.md for what's still manual about provisioning one.
