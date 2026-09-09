# app

The dashboard. Vite + React + TypeScript + Tailwind v4, reading directly from the live subgraph endpoint and directly from Sepolia (a public, keyless RPC) — no backend, no server-side code, nothing here that isn't already public once shipped to a browser.

```
npm install
npm run dev      # local dev server
npm run build    # production build (tsc -b && vite build)
```

## Three views

- **Solvency** (`src/components/SolvencyView.tsx`) — per consortium, per season: cap, minted, retired, in circulation, plus a proportional utilization bar (not a grouped bar chart — at real harvest scale, a handful of demonstration grams against a multi-tonne cap would render as invisible slivers next to the cap bar; a stacked share of the cap stays legible at any ratio). Detector findings (`unauthorizedMints`, `unauthorizedRetirementOutflows`) are rendered directly under the season they belong to, not behind a separate tab. Each finding is labeled — "intentional demonstration" or "predates season re-open, real" — via a small hardcoded classification (`lib/labels.ts`'s `detectorFindingKind`, keyed by `hederaTxId`) rather than left as unlabeled entries a judge has to take on faith; a finding not in that map renders with no badge rather than a guess.
- **Chain** (`src/components/ChainView.tsx`) — a lot's real journey. `lotRef` is assigned at harvest mint (not retirement), so a lot's identity can span two different `Season` entities once it's transformed into a derived product — the view merges both `Lot` records for the selected `lotRef` into one chronological timeline (mint → transfer → transform → retirement), with grams shown at every step. Season-level transfers are labeled as such rather than implied to be lot-attributed — `UnitsTransferred` never carries a `lotRef` at the contract level, so showing them as lot-precise would overclaim what the data actually supports.
- **Season** (`src/components/SeasonView.tsx`) — the ENS name, its expiry, its text records, and current `MINTER` role holders, all read live from Sepolia via `ethers`, not cached and not from the subgraph. Role holders aren't directly enumerable from `hasRoles` (it only answers "does this one account hold it"), so `lib/ens.ts` reconstructs a candidate set from every `EACRolesChanged` event the registry has emitted, then confirms current status for each with a live `hasRoles` call — this deliberately doesn't reimplement the registry's expiry/version-shift logic client-side (see CLAUDE.md, "Making retirement permanent," for why that's subtler than it looks).

## Unit discipline

Every value coming out of the subgraph or ENS stays in grams (as `bigint`/string) until it reaches `lib/format.ts`'s `formatKg`/`formatGrams`, called only at render time. Nothing upstream of a JSX return ever holds a kg-converted number.

## Known scope limits

- `lib/constants.ts`'s `KNOWN_SEASONS`/`labels.ts`'s consortium and season name maps are small local lookups, not derived from on-chain data — a subgraph `Season` stores a namehash (`ensNode`, bytes32), not the human-readable label, and a namehash can't be reversed back into a string. This mirrors `scripts/relayer.mjs`'s own hardcoded `SEASON_ID`/`SEASON_LABEL` constants: "known today because there's a small, fixed set of seasons; becomes a real lookup once this grows."
- Loading and error states are handled explicitly in every view (`lib/useAsync.ts`) — a judge opening this cold sees a spinner, then either real data or an explicit error, never a blank screen.
