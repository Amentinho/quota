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

## Why we retire instead of burn

Hedera HTS `maxSupply` on a `FINITE` token caps *circulating* `totalSupply`, not lifetime issuance — the same semantics as an ERC-20 `totalSupply`: mint increases it, burn decreases it. This isn't a theoretical concern; it's measured behavior on the live token (`0.0.10411251`):

```
Total supply before burn:  3,400,000,000 grams (at cap)
Burn 100,000 grams:         status SUCCESS
Total supply after burn:   3,399,900,000 grams
Mint 1 gram:                 status SUCCESS
Total supply after mint:   3,399,900,001 grams
```

Burning freed up headroom, and minting resumed past the point where the harvest cap should have made it impossible. A system that used `TokenBurnTransaction` as its "consumption" step would let someone over-issue simply by burning and re-minting — the opposite of what a conservation law needs.

So the product never calls `TokenBurnTransaction`. Consumption — at retail, or as input to processing — is a transfer to a dedicated retirement account, made permanently unable to send anything back out. Circulating `totalSupply` never decreases, so `maxSupply` really is a lifetime issuance cap, enforced by Hedera consensus rather than application code. The retirement account's balance, readable from the mirror node, is the public "consumed" figure — the same mechanism carbon credits and renewable energy Guarantees of Origin use to retire credits in practice: a retired credit isn't deleted, it's placed in a registry account that can only ever receive, never spend. Exactly how that account is made permanently unable to send anything is its own question, covered below — we tested three ways to do it and rejected two of them for reasons worth recording alongside the one we kept.

For reference, the rejection at the cap itself behaves exactly as expected:

```
Mint 1 gram beyond cap (total supply already at maxSupply): status TOKEN_MAX_SUPPLY_REACHED
```

## Making retirement permanent

For a retirement account to actually be permanent, a transfer out of it has to be impossible, not just against policy. We tested three ways to guarantee that, in order of strength, against the live token (`0.0.10411251`) — not on theory:

**1. An account whose key can never produce a valid signature — rejected outright by Hedera.** If this worked, no one, not even us, could ever sign a transfer out: a cryptographic proof rather than a promise. Two constructions, both rejected at the protocol level before a transfer could even be attempted:
```
Account with an empty KeyList (zero signers):                status KEY_REQUIRED
Account with a KeyList of 1 key, threshold set to 2 (2-of-1): status INVALID_ADMIN_KEY
```
Hedera validates that an account's key is actually satisfiable before it will create the account — there's no way to construct a genuinely unsignable account on Hedera.

**2. Freezing the account with the token's `freezeKey` — works, but rejected anyway.** We built and proved this first: transfer in, freeze, then an attempted transfer out fails with `ACCOUNT_FROZEN_FOR_TOKEN`. It works, but we dropped it for two reasons unrelated to whether it works: freezing is bidirectional — the same lever that suspends a compromised participant is the one this would spend on retirement instead — and it's reversible right up until the moment `TokenFreezeTransaction` is actually called, so retirement would be final because we remembered to freeze it, not final on arrival. Freezing stays reserved for its real purpose.

**3. A keypair generated for the account, used once for the association Hedera requires, then discarded — what's actually live now.** The retirement account (`0.0.10422087`) was created with a freshly generated key. That key signed exactly one transaction — `TokenAssociateTransaction`, which Hedera always requires the account's own signature for, no exception — and was then never stored, written to a file, or printed anywhere; the last in-process reference to it was dropped immediately after. KYC-approved, received 1 gram, and an outbound transfer attempted with no signature to provide:
```
Transfer 1 gram out of the discarded-key account: status INVALID_SIGNATURE
```
This is weaker than option 1 would have been: it's a trust claim (we say the key is gone) rather than a cryptographic proof (no key could ever have existed). We're documenting that honestly rather than overselling it — the account-creation script is a few lines anyone can read, and there's no step in it where retaining the key would even be tempting, but it remains a claim, not a proof.

One structural finding along the way: `maxAutomaticTokenAssociations` — the usual way to let an account receive a token without ever signing an association — doesn't rescue a KYC-gated token. Auto-association only takes effect as part of a successful transfer, but a transfer to an un-KYC'd account fails outright (`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`), and KYC can't be granted before an association exists (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`). For a token with a `kycKey`, there is no way around signing the association at least once.

The retirement account's balance is public and independently verifiable through Hedera's mirror node, with no need to trust our own reporting of it:

```
https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.10411251/balances?account.id=0.0.10422087
```

Each consortium-season gets its own retirement account under this scheme, so a season's retired total is one mirror-node query away, with no indexing required.

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

Layer 1 — the Hedera asset, its core invariant, and the retirement mechanism — is implemented and verified on testnet. Layers 2 (the Sepolia accountability contract) and 3 (the ENS v2 policy layer) are not yet implemented. See [`CLAUDE.md`](CLAUDE.md) for the current build breakdown.

## License

MIT — see [`LICENSE`](LICENSE).
