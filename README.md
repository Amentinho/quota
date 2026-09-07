# QUOTA

Origin fraud in protected-designation food is not forged certificates. It's volume.

Bronte produces roughly 3,400 tonnes of PDO pistachio per harvest cycle, biennially, yet "Bronte pistachio" sells worldwide, year-round. Attestation systems — certificates, seals, paperwork — can never catch this, because you can always issue one more certificate. There is no conservation law behind a stamp.

QUOTA replaces attestation with a conservation law. A consortium mints exactly one origin unit per certified gram at harvest. Units move down the supply chain under transfer restrictions. Processing retires input units and mints derived units capped by a declared yield ratio. Units are retired at retail. Supply can never exceed the harvest, at any stage of the chain — not because a database says so, but because the underlying token supply physically cannot.

## Core invariants

```
minted(season)  <= cap(season)                          [grams]
retired         <= minted
derived_grams   <= input_grams * yield_bp / 10000        [always floored]
cap is set once at season open, never raised
retiring does NOT free headroom to mint again
```

The atomic unit is one gram. Basis-point math only, always rounded down — rounding up would create units from nothing.

## Architecture

Three layers, deliberately kept separate:

- **Layer 1 — the asset**, on Hedera testnet. One HTS fungible token per consortium-season, `FINITE` supply, `maxSupply` set once in grams at creation, no admin/wipe/pause keys. The cap is enforced by Hedera consensus, not by our code. The token carries a fixed transfer fee denominated in HBAR (never in origin units — a fee paid in grams would destroy supply on every transfer, which is exactly the conservation law this token exists to prove). There is no `feeScheduleKey`, so the fee is immutable for the same reason the cap is: nothing about the token's terms can move after creation. On testnet the fee collector is our own operator account for simplicity; in a real consortium deployment it would be the consortium's own treasury account.
- **Layer 2 — public accountability**, on Ethereum Sepolia. `QuotaAnchor.sol` records mint/transfer/transform/retire events for indexing.
- **Layer 3 — ENS v2 on Sepolia**, load-bearing. Season subname expiry is the mint window. Enhanced Access Control scopes minter delegation to a single season. Resolver text records are the canonical cap and yield-ratio parameters. Participant subnames are non-transferable and gate KYC.

Full design detail lives in [`CLAUDE.md`](CLAUDE.md).

## Trust boundaries

We designed QUOTA around prevention where we can get it, and detection where we can't — and we'd rather say that plainly than overclaim trustlessness.

- **ENS is the policy layer**: the season cap, yield ratios, season window, and minter roles all live in ENS v2 state on Sepolia — not in a database we control.
- **QuotaAnchor on Sepolia is the authorization record**: a mint is only legitimate if it has a matching ENS-authorized anchor event.
- **The relayer is bound to ENS state** and refuses to perform a Hedera mint if the season name it needs no longer resolves.
- **The subgraph is the detector**: it reconciles Hedera mirror-node mint history against Sepolia anchor events, so any mint that happened without a matching authorization is publicly visible.

One limitation we want to be explicit about: the Hedera account holding the token's `supplyKey` could mint directly, bypassing the relayer and ENS entirely — Hedera consensus has no knowledge of ENS or of Sepolia, so nothing on the Hedera side can technically stop that. What QUOTA guarantees is not that this is impossible, but that it cannot be hidden: an unauthorized mint would show up immediately in the subgraph as a mint with no corresponding anchor event.

## Status

Day 1 of ETHGlobal ETHOnline 2026 (submission ~2026-09-16). Repo scaffolding and the Layer 1 invariant proof are in progress. See [`CLAUDE.md`](CLAUDE.md) for current build status.

## License

MIT — see [`LICENSE`](LICENSE).
