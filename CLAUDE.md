# CLAUDE.md — QUOTA

ETHGlobal ETHOnline 2026, "Start from Scratch" track. Day 1: 2026-09-07. Submission ~2026-09-16.

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

## Retire, don't burn (design decision — locked in on day 1, before any code)

Hedera HTS `maxSupply` on a `FINITE` token caps **circulating** `totalSupply` — mint increases it, burn decreases it, same semantics as ERC-20 `totalSupply`. A literal burn would let minting resume afterward, which destroys "supply can never exceed the harvest." We ran `TokenBurnTransaction` once on day 1 purely to confirm this empirically (see Status below for the result) — that test is documentation, not part of the product.

Fix: **the product never calls `TokenBurnTransaction`.**

- Consumption at retail / processing input consumption = transfer units to a dedicated **retirement account**, then freeze that account with the `freezeKey` so units can never leave. Circulating `totalSupply` never decreases, so `maxSupply` is a true **lifetime issuance cap** enforced by Hedera consensus — the original "cap enforced by consensus, not our code" claim holds.
- The retirement account's balance (readable from the mirror node) is the public "consumed" figure.
- This mirrors how carbon credits and renewable Guarantees of Origin are actually retired — it strengthens the pitch, not just a workaround.
- Transformation: input units are **retired**, not burned. Derived units are minted on a **separate token** whose `maxSupply` = `input_cap * yield_bp / 10000`, floored.

## Trust boundaries (prevention where we can, detection where we can't)

State this plainly in the README, don't overclaim trustlessness:

- **ENS is the policy layer**: cap, yield ratios, season window, minter roles.
- **QuotaAnchor (Sepolia) is the authorization record**: a mint is only legitimate if it has a matching ENS-authorized anchor event.
- **The relayer is bound to ENS state** and refuses to mint otherwise.
- **The subgraph is the detector**: it reconciles Hedera mirror-node mint history against anchor events, so any unauthorized mint is publicly visible.
- Explicit limitation: the Hedera `supplyKey` holder *could* mint without going through the relayer/ENS check — Hedera consensus has no knowledge of ENS or Sepolia, so that mint would still succeed on Hedera. It would, however, show up in subgraph reconciliation as a mint with no matching anchor event. We can't make unauthorized minting impossible; we make it impossible to hide.

## Prize tracks (build to these checklists)

1. **Hedera, Tokenization of Anything** — full asset lifecycle: issuance, compliance-controlled transfer, transformation, retirement. Bonus: KYC/freeze controls, custom fee schedule, scheduled transactions, multiple Hedera services (HCS mirroring planned).
2. **The Graph, Composable/Standardized** — one shared schema indexing three different consortia, queried with a single query pattern. Real Subgraph Studio deployment (slug: `quota`) — mocked data disqualifies.
3. **ENS, Best Use of ENSv2** — must be central. Kill test: delete ENS and the contract does not function — no mint authorization, no season boundaries, no cap values, no participant identity.

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

## Verified environment (2026-09-01 prep — do NOT re-check)

- Hedera ATS SDK is BROKEN for our purposes: ESM import fails, monorepo-only build, 1 critical vuln. **Do not use it. Ever.**
- The Graph does NOT support Hedera. We use Ethereum Sepolia (Base Sepolia, Arbitrum Sepolia also supported but not used).
- ENS v2 with Enhanced Access Control is live on Sepolia and usable (beta — contracts may still change before mainnet).
- Hardhat 3.15 needs `"type": "module"` in `package.json` and `hardhat.config.ts` using `defineConfig` from `hardhat/config`. A `.js`/`.mjs` config is rejected with `HHE3`.
- Foundry is NOT installed and we are NOT installing it.
- `@hashgraph/sdk` installs and works. `Client.forTestnet()` needs `.close()` or the process hangs.
- Node v24.20.0, npm 11.19.0, no pnpm, no yarn. macOS arm64.
- `graph-cli` 0.98.1 installed. Subgraph Studio project slug: `quota`.

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

## Working agreements

- Small steps, one component at a time; give a runnable command to see each one work.
- Explain design choices in plain language before implementing.
- Never dump large diffs — split anything large.
- Commit after every working step, descriptive messages — ETHGlobal penalizes sparse or giant-commit history.
- If a dependency fights for more than ~45 minutes, STOP and report. Take the fallback rather than sink the day.
- Ask before adding any dependency not already named.
- Never print secrets back to the user. `.env` gitignored from commit 1.
- End each session by updating this file: what's done, what's next, gotchas — sessions run separately.

## Status

**2026-09-07 — Day 1, in progress.**

Done:
- Repo scaffolded locally: directory structure, MIT license, gitignore, this file, README.

Next:
- Run `hedera/create-token.mjs` once the user has pasted credentials into `.env` and reviewed the script (paused before execution, per user request). Creates the Layer 1 HTS token: name `QUOTA Bronte PDO Pistachio 2026`, symbol `QBRP26`, `maxSupply 3_400_000_000` grams, `decimals 3`, `FINITE`, `supplyKey`/`kycKey`/`freezeKey` all set to the operator key (day-1 simplification — see script comment), custom fixed fee of 1 HBAR per transfer collected by the operator account with `allCollectorsAreExempt: true`, no admin/wipe/pause/feeSchedule keys.
- Prove the invariant on testnet: mint to cap succeeds; mint 1 more fails (record exact status code/error string); burn 100,000 then try minting 1 again (record whether headroom reopens — expected yes, confirms the retire-don't-burn design above).
- Confirm HashScan shows `3,400,000.000` display / `3400000000` raw maxSupply; record both links.
- Report HBAR cost per transaction.

Resolved: repo is public and pushed to https://github.com/Amentinho/quota via SSH (gh CLI is broken on this machine — see above — so we generated a dedicated ed25519 key at `~/.ssh/id_ed25519` and the user added it to their GitHub account; origin remote uses `git@github.com:Amentinho/quota.git`). Custom fee schedule resolved: 1 HBAR fixed fee, denominated in HBAR not the token, collected by the operator account, `allCollectorsAreExempt: true` so treasury/retirement transfers aren't taxed.

**Layer 1 token created.** `HEDERA_TOKEN_ID=0.0.10411251` (also in `.env`). https://hashscan.io/testnet/token/0.0.10411251 — maxSupply `3400000000` raw / `3,400,000.000` as HashScan renders it. Creation tx fee: 24.44346741 ℏ. Confirmed on-chain via HashScan and `hedera/verify-token.mjs`: adminKey, wipeKey, pauseKey, feeScheduleKey all absent (token and fee both immutable); supplyKey/kycKey/freezeKey all set to the operator key. Custom fee live: 1 ℏ fixed fee, collector `0.0.10323351` (operator), `allCollectorsAreExempt: true`.
