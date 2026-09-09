# hedera

HTS scripts using `@hashgraph/sdk` (Layer 1): token creation, mint, retire, transformation. All implemented and run for real: token creation, the mint invariant-proof scripts, the retirement mechanism below, and — for the derived (kernel) product — a second token (`hedera/create-kernel-token.mjs`) with its own deterministic retirement account (`hedera/create-kernel-retirement-account.mjs`) and a deterministic processor account for in-transit custody (`hedera/create-deterministic-processor-account.mjs`), all driven end to end by `scripts/relayer.mjs`'s `transform`/`retire-kernel` commands — see CLAUDE.md, "Enforcing the yield ceiling on-chain."

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

**Transformation (kernel product).** A second token and its own retirement account, for the derived product a harvest lot becomes:

```
node --env-file=.env hedera/create-kernel-token.mjs               # second FINITE-supply token, maxSupply = harvest cap at the declared yield ratio
node --env-file=.env hedera/create-deterministic-processor-account.mjs  # in-transit custody; same key-derivation scheme, needs to sign an outbound transfer
node --env-file=.env hedera/create-kernel-retirement-account.mjs  # same formula as the harvest retirement account, keyed on the kernel token's own ID
```

Kernel token `0.0.10434455`, processor account `0.0.10434464`, kernel retirement account `0.0.10434470` (all in `.env`). The actual mint/transfer/transform/retire sequence for a real lot is run from `scripts/relayer.mjs`, not from these three setup scripts directly — see `scripts/README.md`.
