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

So the product never calls `TokenBurnTransaction`. Consumption — at retail, or as input to processing — is a transfer to a dedicated retirement account. Circulating `totalSupply` never decreases, so `maxSupply` really is a lifetime issuance cap, enforced by Hedera consensus rather than application code. The retirement account's balance, readable from the mirror node, is the public "consumed" figure — the same mechanism carbon credits and renewable energy Guarantees of Origin use to retire credits in practice: a retired credit isn't deleted, it's placed in a registry account. What that account's security property actually is — and it is not "nothing can move it" — is covered below, along with the three approaches we rejected before landing on it.

For reference, the rejection at the cap itself behaves exactly as expected:

```
Mint 1 gram beyond cap (total supply already at maxSupply): status TOKEN_MAX_SUPPLY_REACHED
```

## Making retirement permanent

**Security property, in one sentence a judge can evaluate:** the retirement account's private key is deterministically derived from a formula published in full below, so it is public knowledge and provides no cryptographic protection whatsoever — retirement here means *visible and attributable if reversed*, not *physically impossible to reverse*.

We tried, in order, to make an account where reversal really would be physically impossible, and Hedera doesn't allow it:

**1. An account whose key can never produce a valid signature — rejected outright by Hedera, at creation.** Two constructions, both rejected at the protocol level before any transfer could be attempted:
```
Account with an empty KeyList (zero signers):                status KEY_REQUIRED
Account with a KeyList of 1 key, threshold set to 2 (2-of-1): status INVALID_ADMIN_KEY
```

**2. The same two constructions, applied to an already-associated account via `AccountUpdateTransaction` instead of at creation** — in case Hedera validates key satisfiability only on create and not on update. It validates both:
```
Rekey an associated account to an empty KeyList:                status INVALID_ADMIN_KEY
Rekey an associated account to a 2-of-1 impossible threshold:   status INVALID_ADMIN_KEY
```
Hedera enforces key satisfiability everywhere a key can be set, not just at creation. There is no way to construct a genuinely unspendable account on Hedera, before or after association — this isn't a workaround we missed, it's a wall.

**3. Freezing the account with the token's `freezeKey` — works, but rejected on design grounds.** Transfer in, freeze, then an attempted transfer out fails with `ACCOUNT_FROZEN_FOR_TOKEN`. It works, but freezing is bidirectional — the same lever meant for suspending a compromised participant — and it's reversible right up until `TokenFreezeTransaction` is actually called, so retirement would be final because someone remembered to freeze it, not final on arrival. Freezing stays reserved for its real purpose.

**4. A keypair generated for the account and claimed to be discarded — rejected, because that claim is unverifiable.** We built this next: generate a key, use it once to sign the mandatory association, then never store, write, or print it again. It worked mechanically (outbound transfer with no signature: `INVALID_SIGNATURE`), but a judge has no way to check that the key was actually deleted rather than kept — it's a claim about a private process on our laptop, in a project whose entire pitch is removing exactly that kind of trust assumption. Rejected on principle, not on evidence.

**Adopted: a deterministic, published key.** Rather than a real secret we claim to destroy, the retirement account's key is derived from a formula anyone can run themselves and check against the live account:
```
seed  = sha256("QUOTA-RETIREMENT-" + tokenId)      // tokenId = "0.0.10411251"
key   = PrivateKey.fromBytesED25519(seed)
```
Retirement account `0.0.10422283`, created with the public key from that derivation. On-chain confirmation the account actually uses it — not just that we claim to have created it that way:
```
Derived public key (raw, hex): fd2149afe5e06e4ac09bf505e772cdab662d768ab257170af7454d73c5ede5f2
Account 0.0.10422283's registered key, from the mirror node:  fd2149afe5e06e4ac09bf505e772cdab662d768ab257170af7454d73c5ede5f2  (match)
```
25,000 grams retired into it. We then proved — rather than asserted — that the key is genuinely spendable, by actually moving 1 gram back out with it and back in again:
```
Outbound transfer of 1 gram, signed with the reproduced key: status SUCCESS
Inbound transfer of 1 gram, returning it:                    status SUCCESS
```

**What an attacker could do:** reproduce the same two-line derivation (nothing secret about it) and sign a transfer moving retired units back into circulation — exactly what we just demonstrated ourselves.

**How it's detected:** every such transfer is a normal, permanent, public Hedera transaction against one specific, publicly known account. Anyone checking the mirror node sees a balance drop from an account that no legitimate flow ever draws from — retirement accounts only ever receive in this design. Once the subgraph (Layer 2) is built, this becomes a direct, queryable anomaly rather than something a person has to notice by hand. Same framing as Trust boundaries below: prevention where we can get it, detection where we can't.

```
https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.10411251/balances?account.id=0.0.10422283
```

One structural finding along the way, now confirmed and worth stating as a general constraint, not an incident: **`setMaxAutomaticTokenAssociations` cannot bootstrap an account into holding a KYC-gated token.** Auto-association only takes effect as a side effect of a *successful* transfer; a transfer to a not-yet-KYC'd account fails first (`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`), and KYC can never be granted before an association exists (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`). For any token with a `kycKey`, there is no way to get an account holding it without that account signing an explicit `TokenAssociateTransaction` at least once — full stop, regardless of which retirement scheme is layered on top. (This was found the hard way: an earlier attempt to skip association via auto-association left an account, `0.0.10422047`, permanently stranded — unassociated, with its key already gone.)

Each consortium-season gets its own retirement account under this scheme (the derivation includes the token ID, so a new season's token produces a different, independently reproducible account), so a season's retired total is one mirror-node query away, with no indexing required.

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
