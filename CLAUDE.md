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

- Consumption at retail / processing input consumption = transfer units to a dedicated **retirement account**, then freeze that account with the `freezeKey` so units can never leave. Circulating `totalSupply` never decreases, so `maxSupply` is a true **lifetime issuance cap** enforced by Hedera consensus — the "cap enforced by consensus, not our code" claim holds.
- The retirement account's balance (readable from the mirror node) is the public "consumed" figure.
- This mirrors how carbon credits and renewable Guarantees of Origin are actually retired.
- Transformation: input units are **retired**, not burned. Derived units are minted on a **separate token** whose `maxSupply` = `input_cap * yield_bp / 10000`, floored.
- The retirement-account + freeze flow itself is not yet implemented — see Status.

For reference, minting past the cap in the first place is rejected outright:
```
Mint 1 gram beyond cap (total supply already at maxSupply): status TOKEN_MAX_SUPPLY_REACHED
```

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
- `freezeKey` — suspends a participant, and is reused to permanently lock the retirement account after retirement
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

### Not yet built
- Layer 2: `QuotaAnchor.sol` (`contracts/` is currently just a placeholder).
- Layer 3: ENS subname registration, EAC role grants, resolver text records (`ens/` is currently just a placeholder).
- Subgraph schema and mappings (`subgraph/` is currently just a placeholder).
- Relayer script that binds a Hedera mint call to ENS state before executing it.
- The actual retirement-account + freeze-lock flow described in Retire, don't burn — proven necessary, not yet implemented.
- Distinct `supplyKey`/`kycKey`/`freezeKey` — currently all one operator key; a real consortium deployment would split these so a certifier can hold a scoped minting role without also controlling freeze/KYC.
- Dashboard app, fraud-gap radar script, seed data for multiple consortia.

### Known gotchas
- `Client.forTestnet()` keeps the Node process alive unless `.close()` is called explicitly.
- Hardhat 3 requires ESM (`"type": "module"`) and a `hardhat.config.ts` using `defineConfig` — a `.js`/`.mjs` config fails with `HHE3`.
- `gh` CLI is broken on this machine (wrong CPU architecture); git operations go over SSH with a dedicated key, not HTTPS/gh.
- Without an `adminKey`, the token's `kycKey`/`freezeKey`/fee schedule can never be changed after creation — deliberate (immutability is the point), but any mistake in those parameters at creation time is permanent for this token.

### Open decisions
- When (or whether, for the testnet build) to split `supplyKey`/`kycKey`/`freezeKey` into separate keys instead of reusing the operator key.
