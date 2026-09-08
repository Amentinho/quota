# CLAUDE.md — QUOTA

Local path: `/Users/andreaamenta/Desktop/quota` (not `~/Projects` — deliberately scaffolded on Desktop alongside the unrelated Virtusgreen repo).

## What this is

Origin fraud in protected-designation food isn't forged certificates — it's volume. Bronte produces ~3,400 tonnes of PDO pistachio per harvest, biennially, yet "Bronte pistachio" sells worldwide year-round. Attestation can't catch this: you can always issue one more certificate.

QUOTA replaces attestation with a conservation law. A consortium mints exactly one origin unit (= 1 gram) per certified gram at harvest. Units move down the supply chain under transfer restrictions. Processing retires input units and mints derived units capped by a declared yield ratio. Units are retired at retail. Supply can never exceed the harvest, at any stage.

## Core invariants (protect these)

```
minted(season)  <= cap(season)              [grams]
retired         <= minted
derived_grams   <= input_grams * yield_bp / 10000     [always floored]
cap is set once at season open, never raised
retiring does NOT free headroom to mint again
```

All ratio maths uses integer basis points and always rounds down (floor division). Rounding up would create units from nothing.

## Unit discipline (non-negotiable)

The atomic unit is one GRAM. Every integer in contracts, scripts, subgraph and relayer is a count of grams. Never name a variable `*Kg` — use `*Grams` everywhere. Convert to kg only at the UI rendering edge. HTS `decimals` affects display only — `maxSupply` and every mint/transfer amount is expressed in grams.

## Design decisions

### Retire, don't burn

Hedera HTS `maxSupply` on a `FINITE` token caps **circulating** `totalSupply` — mint increases it, burn decreases it, same semantics as ERC-20 `totalSupply`. A literal burn lets minting resume afterward, which destroys "supply can never exceed the harvest."

Confirmed empirically against the live token (`0.0.10411251`), not assumed:
```
Total supply before burn:  3,400,000,000 grams (at cap)
Burn 100,000 grams:         status SUCCESS
Total supply after burn:   3,399,900,000 grams
Mint 1 gram:                 status SUCCESS
Total supply after mint:   3,399,900,001 grams
```
Burning did reopen mint headroom.

Fix: **the product never calls `TokenBurnTransaction`.**

- Consumption at retail / processing input consumption = transfer units to a dedicated **retirement account**, made permanently unable to send anything back out (see Making retirement permanent, below, for how). Circulating `totalSupply` never decreases, so `maxSupply` is a true **lifetime issuance cap** enforced by Hedera consensus — the "cap enforced by consensus, not our code" claim holds.
- The retirement account's balance (readable from the mirror node) is the public "consumed" figure.
- This mirrors how carbon credits and renewable Guarantees of Origin are actually retired.
- Transformation: input units are **retired**, not burned. Derived units are minted on a **separate token** whose `maxSupply` = `input_cap * yield_bp / 10000`, floored.
- Built and verified against the live token — see Status.

For reference, minting past the cap in the first place is rejected outright:
```
Mint 1 gram beyond cap (total supply already at maxSupply): status TOKEN_MAX_SUPPLY_REACHED
```

### Making retirement permanent

**Security property, stated precisely:** the retirement account's key is not secret — it's deterministically derived from a published formula, so it provides no cryptographic protection. Retirement here means *any reversal is publicly visible and attributable to a specific known account*, not *reversal is physically impossible*. That distinction matters and should never be blurred in the README or pitch.

Four things tested against the live token (`0.0.10411251`), in order — status codes measured, not assumed:

1. **Unsignable account at creation (empty KeyList, or impossible threshold key) — rejected by Hedera itself.** `hedera/investigate-unspendable-key.mjs`.
   ```
   AccountCreateTransaction, key = empty KeyList (0 members):              KEY_REQUIRED
   AccountCreateTransaction, key = KeyList(1 member), threshold 2 (2-of-1): INVALID_ADMIN_KEY
   ```

2. **Same two constructions via `AccountUpdateTransaction`, rekeying an already-associated account — also rejected.** `hedera/investigate-post-association-unspendable.mjs`. Tested specifically because option 1's constraint might only apply at creation, not update.
   ```
   AccountUpdateTransaction, new key = empty KeyList:              INVALID_ADMIN_KEY
   AccountUpdateTransaction, new key = 2-of-1 impossible threshold: INVALID_ADMIN_KEY
   ```
   Hedera enforces key satisfiability everywhere a key can be set. **There is no Hedera mechanism, at creation or after, for a genuinely unspendable account.** This is a protocol wall, not a workaround we missed — settle this permanently, don't re-investigate it in a future session.

3. **Freeze with the token's `freezeKey` — works, rejected on design grounds.** `hedera/create-retirement-account.mjs` + `hedera/freeze-retirement-account.mjs` + `hedera/prove-retirement-immutable.mjs` (kept as a proven-but-superseded prototype; account `0.0.10421765`, 50,000 grams, frozen, `ACCOUNT_FROZEN_FOR_TOKEN` on outbound attempt). Rejected because freezing is bidirectional (the lever meant for suspending a compromised participant) and reversible right up until `TokenFreezeTransaction` is actually called. **Correction to a previous entry here**: this file once stated as fact that a frozen account can't receive further transfers either. Never actually tested — inferred from freeze semantics, not measured. Moot now; treat as unverified if it resurfaces.

4. **Ephemeral keypair, used once for the required association, then discarded — built, then rejected on principle.** `hedera/create-discarded-key-retirement-account.mjs` (account `0.0.10422087`, kept as a superseded prototype). Worked mechanically: key signed exactly one `TokenAssociateTransaction`, then was never stored, written, or printed; outbound attempt with no signature failed with `INVALID_SIGNATURE`. Rejected anyway: "we discarded it" is a claim about a private process on one laptop, unverifiable by anyone else — exactly the kind of trust assumption this project exists to remove. Do not resurrect this approach; it was a mistake in judgment, not a technical failure, so it needs a decision override, not a retest, to come back.

**Adopted: deterministic, published key.**
```
seed = sha256("QUOTA-RETIREMENT-" + tokenId)   // tokenId = "0.0.10411251" for this token
key  = PrivateKey.fromBytesED25519(seed)
```
`hedera/create-deterministic-retirement-account.mjs`. Retirement account `0.0.10422283`. Verified, not just asserted, on two axes:
- **The account really uses the derived key** — on-chain confirmation via mirror node: registered key `fd2149afe5e06e4ac09bf505e772cdab662d768ab257170af7454d73c5ede5f2` matches the raw public key from the derivation exactly.
- **The key really is spendable, not just theoretically** — the script itself moves 1 gram out (signed with the reproduced key: `SUCCESS`) and back in (`SUCCESS`), demonstrating the residual risk concretely rather than asserting it.

25,000 grams retired into it. Attacker capability: anyone reproducing the two-line derivation can sign a transfer out, same as we just did. Detection: any such transfer is a public, permanent Hedera transaction against one specific known account that legitimate flows never draw from; today that means the mirror node, and once Layer 2's subgraph exists, a direct queryable anomaly. Same "prevention where we can, detection where we can't" framing as Trust boundaries below — this is a second instance of it, not a one-off.

No private key is stored in `.env` for this account — there's nothing to protect; it's re-derivable on demand from the token ID by anyone, including future sessions.

**Structural finding, confirmed and general, not an incident to be filed away:** `setMaxAutomaticTokenAssociations` cannot bootstrap an account into holding a KYC-gated token. Auto-association only takes effect as a side effect of a *successful* transfer; a transfer to a not-yet-KYC'd account fails first (`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`), and KYC can never be granted before an association exists (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`). For any token with a `kycKey` — including future consortium tokens, not just this one — there is no way to get an account holding it without that account signing an explicit `TokenAssociateTransaction` at least once. This constraint shapes every future script that creates an account meant to hold QUOTA units. Found via an account (`0.0.10422047`) permanently stranded by a first attempt that assumed auto-association would work — unassociated, key already discarded, unrecoverable.

Each consortium-season gets its own retirement account under this scheme (the derivation includes the token ID, so a new season's token deterministically produces a different, independently reproducible account) — retired totals are then one mirror-node query away per season, no indexing needed.

### Trust boundaries

State this plainly in the README, don't overclaim trustlessness:

- **ENS is the policy layer**: cap, yield ratios, season window, minter roles.
- **QuotaAnchor (Sepolia) is the authorization record**: a mint is only legitimate if it has a matching ENS-authorized anchor event.
- **The relayer is bound to ENS state** and refuses to mint otherwise.
- **The subgraph is the detector**: it reconciles Hedera mirror-node mint history against anchor events, so any unauthorized mint is publicly visible.
- Explicit limitation: the Hedera `supplyKey` holder *could* mint without going through the relayer/ENS check — Hedera consensus has no knowledge of ENS or Sepolia, so that mint would still succeed on Hedera. It would, however, show up in subgraph reconciliation as a mint with no matching anchor event. We can't make unauthorized minting impossible; we make it impossible to hide.

## Design requirements

- Full asset lifecycle: issuance, compliance-controlled transfer, transformation, retirement — with KYC/freeze controls, a custom fee schedule, and (planned) HCS mirroring alongside HTS.
- One shared subgraph schema indexing multiple consortia through a single query pattern, backed by a real Subgraph Studio deployment (project slug: `quota`) — no mocked data.
- ENS must be central to authorization, not decorative. Kill test: delete ENS state and the system stops functioning — no mint authorization, no season boundaries, no cap values, no participant identity.

## Architecture — three layers

**Layer 1 — the asset, Hedera testnet, `@hashgraph/sdk` only.**
One HTS fungible token per consortium-season.
- `supplyType: FINITE`, `maxSupply` = certified harvest in grams (e.g. `3_400_000_000`)
- `decimals: 3` — display only; dividing raw grams by 1000 happens to render as kg on explorers
- `supplyKey` — mints at harvest; the only key retained (see below)
- **No `adminKey`, no `wipeKey`, no `pauseKey`** — fully immutable token, no way to change terms after creation
- Custom fixed fee (consortium levy) set **at creation time**, no `feeScheduleKey` — the fee is immutable too, since without an admin key there's no way to add a fee-schedule key later
- `kycKey` — gates which supply-chain participants may hold units
- `freezeKey` — suspends a compromised participant. Not used for retirement (see Making retirement permanent) — retirement uses a deterministic, published key instead, so freeze stays dedicated to its real purpose
- The cap is enforced by Hedera consensus, not our code. Do not reimplement it in Solidity.

**Layer 2 — public accountability, Ethereum Sepolia.**
`QuotaAnchor.sol` records the events the subgraph indexes:
```
SeasonOpened(consortiumId, year, capGrams, hederaTokenId, ensNode)
UnitsMinted(seasonId, to, grams, hederaTxId)
UnitsTransferred(seasonId, from, to, grams)
Transformed(inputSeasonId, inputGrams, outputSeasonId, outputGrams, productType, yieldBp)
UnitsRetired(seasonId, grams, lotRef, hederaTxId)
ParticipantRegistered(addr, role)
```
A small synchronous relayer performs the HTS operation, checks ENS state first, then writes the anchor event. Keep it dumb.

**Layer 3 — ENS v2 on Sepolia, load-bearing, not decoration.**
```
quota.eth
 └── bronte.quota.eth          consortium, holds its own key
     ├── 2026.bronte.quota.eth season, EXPIRES at harvest close
     │    └── lot-0412.2026...  lot
     └── rossi.bronte.quota...  participant, NON-transferable
```
Four load-bearing mechanisms:
1. Season subname **expiry is the mint window** — the relayer resolves the season name and refuses to mint if it no longer resolves. No timer, no `closeSeason()` — the authority to mint simply ceases to exist (as a policy fact the relayer honors; see Trust boundaries for what this does and doesn't guarantee at Hedera consensus).
2. **EAC grants a MINTER role scoped to the season name.** The consortium delegates to a certifier without handing over keys. Revocation is instant and scoped to one season.
3. **Resolver text records are the canonical parameters.** QuotaAnchor reads the cap from the resolver rather than storing it: `quota.unit = "g"`, `quota.cap.g`, `quota.token.hedera`, `quota.yield.kernel.bp`, `quota.yield.cream.bp`. Basis points, never decimal strings — no float parsing anywhere.
4. **Participant subnames are non-transferable** and gate KYC grants on the Hedera token. You cannot sell your place in the supply chain.

## Repo layout

```
quota/
  CLAUDE.md          this file
  contracts/         Hardhat 3, QuotaAnchor.sol
  hedera/             HTS scripts using @hashgraph/sdk
  ens/               subname registration, EAC roles, text records
  subgraph/          schema.graphql, mappings, subgraph.yaml
  app/               Vite + React + TS + Tailwind dashboard
  radar/             fraud-gap script
  scripts/           seed data for 3 consortia
  docs/ARCHITECTURE.md
  README.md
  LICENSE            MIT
```

## Environment and tooling notes (do not re-verify — already confirmed)

- Hedera ATS SDK is BROKEN for our purposes: ESM import fails, monorepo-only build, 1 critical vuln. **Do not use it. Ever.**
- The Graph does NOT support Hedera. We use Ethereum Sepolia (Base Sepolia, Arbitrum Sepolia also supported but not used).
- ENS v2 with Enhanced Access Control is live on Sepolia and usable (beta — contracts may still change before mainnet).
- Hardhat 3.15 needs `"type": "module"` in `package.json` and `hardhat.config.ts` using `defineConfig` from `hardhat/config`. A `.js`/`.mjs` config is rejected with `HHE3`.
- Foundry is NOT installed and we are NOT installing it.
- `@hashgraph/sdk` installs and works. `Client.forTestnet()` needs `.close()` or the process hangs.
- Node v24.20.0, npm 11.19.0, no pnpm, no yarn. macOS arm64.
- `graph-cli` 0.98.1 installed. Subgraph Studio project slug: `quota`.
- `gh` CLI is installed at `/usr/local/bin/gh` but is an x86_64 binary that fails with "bad CPU type in executable" on this arm64 Mac (broken Homebrew install — do not try to fix via brew). Git pushes go over SSH with a dedicated ed25519 key at `~/.ssh/id_ed25519`, added to the GitHub account manually; origin remote is `git@github.com:Amentinho/quota.git`, not HTTPS.

## Working agreements

- Small steps, one component at a time; give a runnable command to see each one work.
- Explain design choices in plain language before implementing.
- Never dump large diffs — split anything large.
- Commit after every working step with a descriptive message; avoid squashing history into a few giant commits.
- If a dependency fights for more than ~45 minutes, stop and report. Take the fallback rather than burn time sinking into it.
- Ask before adding any dependency not already named.
- Never print secrets back to the user. `.env` is gitignored from the first commit.
- Repo files (README, this file) describe what the system does and why, in the present tense — no day numbers, dates, schedules, or timeline framing.
- End each working session by updating this file: what's built, what's not yet built, known gotchas, open decisions — sessions run independently of each other.

## Status

### Built
- Repo scaffold: directory structure, MIT license, gitignore, README, this file. Public on GitHub: https://github.com/Amentinho/quota.
- Layer 1 HTS token created and verified on Hedera testnet. `HEDERA_TOKEN_ID=0.0.10411251` (also in `.env`, gitignored). https://hashscan.io/testnet/token/0.0.10411251 — `maxSupply` `3400000000` raw / `3,400,000.000` as HashScan renders it (decimals 3 happens to render grams as kg). Creation transaction fee: 24.44346741 ℏ. Confirmed on-chain: `adminKey`, `wipeKey`, `pauseKey`, `feeScheduleKey` all absent (token and its 1 ℏ transfer fee are both immutable). `supplyKey`/`kycKey`/`freezeKey` all set to the operator key (see Not yet built). Custom fee live: 1 ℏ fixed fee per transfer, collector `0.0.10323351` (operator account), `allCollectorsAreExempt: true`.
- Invariant proof, run against the live token:
  - Mint to cap (3,400,000,000 grams): status `SUCCESS`, resulting total supply equals cap exactly.
  - Mint 1 gram beyond cap: rejected, status `TOKEN_MAX_SUPPLY_REACHED`.
  - Burn 100,000 grams, then mint 1 gram again: both status `SUCCESS` — burning reopened mint headroom. This is the empirical basis for Retire, don't burn above.
- Retirement mechanism, built and verified against the live token — see Making retirement permanent above for the full evidence, all four tested approaches, and why three were rejected. Canonical retirement account: `HEDERA_RETIREMENT_ACCOUNT_ID=0.0.10422283` (in `.env`; no key stored — it's re-derivable on demand from `sha256("QUOTA-RETIREMENT-" + tokenId)`, not a secret). Holds 25,000 grams. On-chain key confirmed via mirror node to match the derivation exactly; spendability proven (not just claimed) by an actual round-trip transfer.
  - Deprecated prototypes (superseded, not deleted — historical record, and still holding retired supply):
    - `0.0.10421765` (`HEDERA_DEPRECATED_FROZEN_RETIREMENT_ACCOUNT_ID`/`_KEY` in `.env`) — 50,000 grams, frozen via `freezeKey`. The freeze-based approach.
    - `0.0.10422087` (`HEDERA_DEPRECATED_DISCARDEDKEY_RETIREMENT_ACCOUNT_ID` in `.env`, no key — it really was discarded) — 1 gram, the discarded-key approach, rejected on principle (unverifiable claim) rather than for a technical flaw.
  - Incidental leftover accounts from investigation, no ongoing purpose, not tracked in `.env`: `0.0.10422047` (permanently stranded — unassociated, key discarded, see the auto-association/KYC finding below), `0.0.10422250` (normal spendable key, holds 1 gram, created while testing whether `AccountUpdateTransaction` could rekey to something unspendable — it can't).

### Not yet built
- Layer 2: `QuotaAnchor.sol` (`contracts/` is currently just a placeholder).
- Layer 3: ENS subname registration, EAC role grants, resolver text records (`ens/` is currently just a placeholder).
- Subgraph schema and mappings (`subgraph/` is currently just a placeholder).
- Relayer script that binds a Hedera mint call to ENS state before executing it.
- Transformation flow (input units retired, derived units minted on a separate token) — not yet implemented; the retirement primitive it depends on is now built.
- Distinct `supplyKey`/`kycKey`/`freezeKey` — currently all one operator key; a real consortium deployment would split these so a certifier can hold a scoped minting role without also controlling freeze/KYC.
- Dashboard app, fraud-gap radar script, seed data for multiple consortia.

### Known gotchas
- `Client.forTestnet()` keeps the Node process alive unless `.close()` is called explicitly.
- Hardhat 3 requires ESM (`"type": "module"`) and a `hardhat.config.ts` using `defineConfig` — a `.js`/`.mjs` config fails with `HHE3`.
- `gh` CLI is broken on this machine (wrong CPU architecture); git operations go over SSH with a dedicated key, not HTTPS/gh.
- Without an `adminKey`, the token's `kycKey`/`freezeKey`/fee schedule can never be changed after creation — deliberate (immutability is the point), but any mistake in those parameters at creation time is permanent for this token.
- Hedera validates account-key satisfiability everywhere a key can be set, not just at creation: an empty `KeyList` fails with `KEY_REQUIRED`, a `KeyList` whose threshold exceeds its member count fails with `INVALID_ADMIN_KEY` — on `AccountCreateTransaction` and on `AccountUpdateTransaction` alike. Settled: there is no way to construct a genuinely unspendable account on Hedera. Don't re-investigate this.
- `TokenGrantKycTransaction` requires the target account to already be associated with the token (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` otherwise), and `TokenAssociateTransaction` always requires the account's own signature — no exception, even with `setMaxAutomaticTokenAssociations` set. Auto-association only fires as a side effect of a *successful* transfer, and a transfer to a not-yet-KYC'd account fails first (`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`), so for a KYC-gated token there's no way to bootstrap an account into holding it without signing an explicit association at least once. Applies to every account this project ever creates to hold QUOTA units, not just retirement accounts.
- `TokenFreezeTransaction` blocks transfers in *both* directions, not just outbound — noted for the record from the now-superseded freeze-based retirement prototype; not verified by us directly and not relevant to the current retirement mechanism.
- "We generated a key and discarded it" is not an acceptable design for anything user-facing in this project, even though it works mechanically — it reintroduces exactly the kind of unverifiable trust claim the product exists to remove. Prefer deterministic/published or otherwise independently verifiable constructions.

### Open decisions
- When (or whether, for the testnet build) to split `supplyKey`/`kycKey`/`freezeKey` into separate keys instead of reusing the operator key.
- How per-season retirement-account provisioning gets triggered in the actual product: one deterministic retirement account per consortium-season, keyed off the season's token ID, is the decided design (see Making retirement permanent), but nothing yet automates creating one when a season opens — today it's a manually run script.
