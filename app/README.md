# app

The dashboard. Vite + React + TypeScript + Tailwind v4, reading directly from the live subgraph endpoint and directly from Sepolia (a public, keyless RPC). The deployed site is strictly read-only — no backend, no server-side code, nothing here that isn't already public once shipped to a browser. A local-only demo server (`server/`, never deployed, never built into `dist/`) exists purely for recording; see "Demo tab" below and `server/README.md`.

```
npm install
npm run dev      # local dev server
npm run build    # production build (tsc -b && vite build)
```

## Three views

- **Solvency** (`src/components/SolvencyView.tsx`) — per consortium, per season: cap, minted, retired, in circulation, as four stat boxes. An earlier version of this view also drew a proportional utilization bar under the stats; it was removed before the recording because at real harvest scale (a handful of demonstration grams against a multi-tonne cap) the bar rendered as visually empty, and an apologetic caption explaining why still reads as broken on camera — the stat boxes carry the same real figures without needing a visual that only works at production scale. Detector findings (`unauthorizedMints`, `unauthorizedRetirementOutflows`) are rendered directly under the season they belong to, not behind a separate tab. Each finding is labeled — "intentional demonstration" or "predates season re-open, real" — via a small hardcoded classification (`lib/labels.ts`'s `detectorFindingKind`, keyed by `hederaTxId`) rather than left as unlabeled entries a judge has to take on faith; a finding not in that map renders with no badge rather than a guess.
- **Chain** (`src/components/ChainView.tsx`) — a lot's real journey. `lotRef` is assigned at harvest mint (not retirement), so a lot's identity can span two different `Season` entities once it's transformed into a derived product — the view merges both `Lot` records for the selected `lotRef` into one chronological timeline (mint → transform → retirement), with grams shown at every step. Defaults to `lot-2026-005`, a full mint → transfer → transform-at-ceiling → retire-both-sides run, if present. Custody transfers where `from === to` are filtered out of the timeline entirely rather than shown as a step: `UnitsTransferred` anchors the relayer's own signer address on both sides (Hedera account IDs have no Ethereum-address equivalent to anchor instead), so every transfer this relayer has ever recorded looks like a same-address no-op — real information, but not one an address-pair card can honestly show. The real Hedera-side movement still happens and is still anchored; it just isn't rendered as its own step.
- **Season** (`src/components/SeasonView.tsx`) — the ENS name, its expiry, its text records, and current `MINTER` role holders, all read live from Sepolia via `ethers`, not cached and not from the subgraph. Role holders aren't directly enumerable from `hasRoles` (it only answers "does this one account hold it"), so `lib/ens.ts` reconstructs a candidate set from every `EACRolesChanged` event the registry has emitted, then confirms current status for each with a live `hasRoles` call — this deliberately doesn't reimplement the registry's expiry/version-shift logic client-side (see CLAUDE.md, "Making retirement permanent," for why that's subtler than it looks).

## Demo tab

A fourth tab, `src/components/DemoView.tsx`, calling the local server in `server/` (`http://localhost:4317`), laid out as three labelled sections matching the three-level ENS permission structure (see CLAUDE.md and the top-level README):

1. **Approver** — an editable address field targets any account for grant/revoke; a live list of current `MINTER` holders (read directly from Sepolia via `lib/ens.ts`'s `readSeasonEnsState`, not through the local server, since it's a public read); and an "Attempt mint as Approver" button that mints 1g using the Approver's own address as certifier — refused every time, on-chain-checked, since the Approver holds `MINTER_ROLE_ADMIN`, never `MINTER`.
2. **Issuer** — a selector between the two addresses that hold `MINTER`, a grams field, and a mint button.
3. **Transform flow** — mint, transfer, and transform as three explicit steps, each its own button and its own real transaction, with the processor account's live harvest-token balance shown and refreshed between them. Nothing tops up the processor silently: transforming more than was actually transferred in fails with a clear, on-screen refusal (`REFUSED: processor holds Xg, needs Yg for this transform. No transaction sent.`) before Sepolia or Hedera is touched. An earlier version auto-topped-up on a shortfall, which made "mint 100g, transform 1000g" just work with the difference materializing off-screen — replaced with explicit funding instead of a smarter top-up. The transform step still reads `quota.yield.kernel.bp` live from ENS and recomputes `floor(input × yieldBp / 10000)` on every keystroke next to the fields, so the ceiling is visibly derived from the live ratio.

Every response renders a headline plus the actual raw payload underneath (the real revert string, status code, or transaction hashes) — the credibility is the unparaphrased error, not a friendly summary.

Gated behind `import.meta.env.DEV`, which Vite statically replaces with `true` under `vite dev` and `false` for `vite build` — so `npm run build`'s output doesn't just hide this tab at runtime, it never contains its code at all. Checked directly, not assumed: the built bundle was grepped for this component's distinctive strings (`localhost:4317`, `Approver`, `MINTER_ROLE_ADMIN`, `processor-balance`), for the new Approver/Issuer addresses themselves, and for any 32-byte hex string that could be a private key — zero matches.

## Unit discipline

Every value coming out of the subgraph or ENS stays in grams (as `bigint`/string) until it reaches `lib/format.ts`'s `formatKg`/`formatGrams`, called only at render time. Nothing upstream of a JSX return ever holds a kg-converted number.

## Known scope limits

- `lib/constants.ts`'s `KNOWN_SEASONS`/`labels.ts`'s consortium and season name maps are small local lookups, not derived from on-chain data — a subgraph `Season` stores a namehash (`ensNode`, bytes32), not the human-readable label, and a namehash can't be reversed back into a string. This mirrors `scripts/relayer.mjs`'s own hardcoded `SEASON_ID`/`SEASON_LABEL` constants: "known today because there's a small, fixed set of seasons; becomes a real lookup once this grows."
- Loading and error states are handled explicitly in every view (`lib/useAsync.ts`) — a judge opening this cold sees a spinner, then either real data or an explicit error, never a blank screen.
