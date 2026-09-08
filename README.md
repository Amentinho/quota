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

## ENS v2: making it load-bearing

The kill test for this layer, stated in the architecture from the start: delete ENS and the system stops functioning. Not "loses a feature" — stops. No mint authorization, no season boundaries, no cap values, no participant identity. Everything below is built and proven against that bar, not asserted to meet it.

**What's registered, live on Sepolia:**
```
quota.eth                    — consortium root
  bronte.quota.eth           — consortium, owns its own subregistry
    2026.bronte.quota.eth    — the season, with a real expiry
    rossi.bronte.quota.eth   — participant, registered with no transfer role
```

**Two findings from actually registering these, not from reading docs:**

Registration on this ENSv2 beta pays in a mock ERC20 (`MockDAI`), not ETH — calling `getRegisterPrice` with `paymentToken = address(0)` reverts with `PaymentTokenNotSupported`. The mock token has a public `mint()` (it's explicitly a testnet faucet token), so registration is mint → approve → commit → wait 60s → register.

Expiry gating uses two different mechanisms, and getting this right mattered for how `QuotaAnchor` checks a season. `getResolver(label)`/`getSubregistry(label)` (string-label lookups) check expiry directly and return the zero address once a name is expired. Role checks work differently but land in the same place: `_constructResource()` computes the resource ID used for `hasRoles()` as `eacVersionId` normally, but `eacVersionId + 1` once expired — a version nothing has ever been granted a role on. So `hasRoles()` also returns `false` for everyone post-expiry, without any role data actually being deleted; expiry just shifts which resource future lookups land on. (Our first read of the source concluded `hasRoles` *wasn't* expiry-gated — wrong, from stopping one function short. The empirical proof below caught it: `hasRoles` returned `false` after expiry when it should have still been `true` had our first reading been correct. Corrected before it reached this file for good, not after.) Both checks are still made separately in the contract, not collapsed into one — they're different mechanisms even though they agree at expiry, and checking resolution explicitly keeps the contract's intent legible rather than relying on an indirect version-shift side effect.

**Non-transferable participant subnames**, confirmed against source rather than assumed: `PermissionedRegistry`'s transfer hook reverts with `TransferDisallowed` unless the *current owner* holds `ROLE_CAN_TRANSFER_ADMIN` on their own token. `rossi.bronte.quota.eth` was registered without that role — no extra code needed, just omitting one bit at registration makes the name genuinely non-transferable at the protocol level.

**Enhanced Access Control**, closing item 5: `MINTER` is a custom role bit (nybble 10 of `PermissionedRegistry`'s role space — unused by ENS's own `RegistryRolesLib`, confirmed by reading it, not guessed). Granting or revoking it is one `grantRoles`/`revokeRoles` call on the season's resource — no contract redeploy, no code change, scoped to that one season.

### Proof, three ways, each with the real status code

**(a) Certifier mints against the season — succeeds.**
```
Season resolves (resolver 0x2EF5C95979534a53cd31F074c7Ea36DCA3813274) and
0x7DFdD0fd40A1e4208BcE04Ac534B493ec4627eC6 holds MINTER. Proceeding.
Hedera mint: SUCCESS
Sepolia anchor: SUCCESS
```

**(b) Consortium revokes the MINTER role. Same call, immediate refusal — no transaction sent, contract untouched.**
```
REFUSED: 0x7DFdD0fd40A1e4208BcE04Ac534B493ec4627eC6 does not hold MINTER role
for this season. No transaction sent.
```
This is the relayer's own off-chain check catching it before anything reaches Sepolia or Hedera — not a contract revert. The contract enforces the same check independently if called directly; this run never got that far.

**(c) Past expiry, mint fails with nobody having done anything.**

For this to isolate expiry specifically — rather than repeat proof (b) — the MINTER role was re-granted first, so the *only* difference from proof (a) is elapsed time, not role state. Waited for real wall-clock time to pass the season's actual expiry, then ran the identical command:
```
REFUSED: "2026.bronte.quota.eth" does not resolve (expired or unregistered).
No transaction sent.
```
A different message than proof (b) — confirming this is genuinely the resolution check firing, not the role check again. Independently confirmed on-chain afterward, not just trusted from the relayer's own output: `getResolver("2026")` on bronte's registry now returns the zero address.

No one revoked anything, closed the season, or touched the contract between (a) and (c). Time passed, and the authority to mint stopped existing.

**A note on the expiry window itself:** the proof above used a 30-minute expiry so all three proofs, including waiting past expiry, could run inside one session. The mechanism is exactly the same regardless of duration — the season was re-registered afterward with a 60-day expiry (covering the rest of the build), and in production this would be set to the real harvest-close date. Nothing about *how* expiry gates minting depends on how far out it's set.

## The subgraph: composable across consortia, and an actual detector

One shared GraphQL schema, deployed to Subgraph Studio (project slug `quota`) on Ethereum Sepolia. The composability claim: `Consortium`, `Season`, `Participant`, `Lot`, `Transformation`, and `Retirement` are all reachable from a `Consortium`, and nothing in the schema is Bronte-specific — the same query works for any consortium, with only the id changing. Bronte is the only consortium with real data today; the schema doesn't assume that, and we haven't padded it with fabricated data for other consortia to make the claim look bigger than it is.

**How Hedera mirror-node data gets into a subgraph at all — a design decision, not an afterthought.** Subgraph mappings are deterministic, sandboxed WASM: they react to events on the indexed chain and cannot make outbound HTTP calls to an arbitrary REST API. There's no way for this subgraph to reach Hedera's mirror node directly. So the actual reconciliation happens off-chain, in `scripts/relayer.mjs`'s `reconcile-mints` command: it fetches the full Hedera mint history for the token, fetches the full `UnitsMinted` anchor history from every `QuotaAnchor` address ever deployed, and anchors a new `UnauthorizedMintDetected` event for any Hedera mint with no matching anchor anywhere. The subgraph indexes *that* event — it never talks to Hedera. The off-chain reconciler is the actual detector; the subgraph is what makes its findings queryable. (Same story, same code path, for `RetirementOutflowDetected` — the retirement tripwire from earlier in this build.)

**Two real bugs, found by running the reconciler, not by inspection.** First run compared Hedera's mint history against only the *current* `QuotaAnchor` address — every mint anchored against a now-superseded address (this project redeployed the contract several times over the build, each time for a real reason: closing the ENS TODO, adding the detector event, fixing a missing `seasonId`) came back as a false "unauthorized." Fixed by checking every deployed address's history, which is the correct design regardless of redeploy count. Second run *still* produced false positives: the transaction-ID normalizer used chained non-global `.replace()` calls, which only touch the first `.` in a `0.0.x` account ID — the same mistake as an earlier HashScan URL bug in this project, this time in a new place. Rewrote it as an explicit regex, verified independently, then reran.

**Clean result, verified:** minted 1 gram legitimately through the relayer (anchored), then minted 1 gram directly via Hedera SDK bypassing the relayer entirely (`scripts/mint-bypassing-relayer.mjs` — a permanent testing tool, not a throwaway), simulating a genuine unauthorized mint. The reconciler flagged exactly the bypass mint and correctly recognized every legitimately-anchored mint, including ones anchored against three different historical contract addresses.

### Three queries against the live endpoint

Deployed subgraph endpoint: *(added once deployed — Studio deploy key needed, see Status)*.

**1. Season lifecycle — the composability claim itself.** Swap `consortiumId` for any consortium's id and the shape of the response doesn't change:
```graphql
query SeasonLifecycle {
  consortium(id: "0x15b5c6738cfb5e2b01ba96ceeaa44f6d9c1f657b4f24f5df918008069f036c4c") {
    id
    seasons {
      id
      year
      hederaTokenId
      capGrams
      mintedGrams
      retiredGrams
      inCirculationGrams
      utilisationBp
    }
  }
}
```

**2. Fraud findings — both detector paths, for one consortium.**
```graphql
query FraudFindings {
  consortium(id: "0x15b5c6738cfb5e2b01ba96ceeaa44f6d9c1f657b4f24f5df918008069f036c4c") {
    seasons {
      id
      unauthorizedMints {
        grams
        hederaTxId
        blockTimestamp
        transactionHash
      }
      unauthorizedRetirementOutflows {
        grams
        hederaTxId
        blockTimestamp
      }
    }
  }
}
```

**3. Retirement traceability — lots and what's been retired against them.**
```graphql
query RetirementsBySeason {
  season(id: "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46") {
    id
    lots {
      id
      lotRef
      totalRetiredGrams
      retirements {
        grams
        hederaTxId
        blockTimestamp
      }
    }
  }
}
```

## Architecture

Three layers, deliberately kept separate:

- **Layer 1 — the asset**, on Hedera testnet. One HTS fungible token per consortium-season, `FINITE` supply, `maxSupply` set once in grams at creation, no admin/wipe/pause keys. The cap is enforced by Hedera consensus, not by our code. The token carries a fixed transfer fee denominated in HBAR (never in origin units — a fee paid in grams would destroy supply on every transfer, which is exactly the conservation law this token exists to prove). There is no `feeScheduleKey`, so the fee is immutable for the same reason the cap is: nothing about the token's terms can move after creation. On testnet the fee collector is our own operator account for simplicity; in a real consortium deployment it would be the consortium's own treasury account.
- **Layer 2 — public accountability**, on Ethereum Sepolia. `QuotaAnchor.sol` records mint/transfer/transform/retire events for indexing. Deployed and verified: [`0x39F0Fded796cB5323048a15b907CcE38979EDa2c`](https://sepolia.etherscan.io/address/0x39F0Fded796cB5323048a15b907CcE38979EDa2c#code). It stores almost nothing — the only state is the immutable `relayer` address allowed to call it, and one small struct per season recording where to look on ENS; everything else is emit-only. The cap it records at season open is read live from the resolver at mint-anchor time, not supplied by whoever calls the contract — see "ENS v2: making it load-bearing" below.
- **Layer 3 — ENS v2 on Sepolia**, load-bearing, not decoration. `quota.eth` → `bronte.quota.eth` → `2026.bronte.quota.eth`, all live on Sepolia testnet. Season subname expiry is the mint window. Enhanced Access Control scopes a `MINTER` role to a single season. Resolver text records are the canonical cap and yield-ratio parameters, read on-chain by the contract itself. Participant subnames are non-transferable and gate KYC. Full detail and the three-part proof below.

Full design detail lives in [`CLAUDE.md`](CLAUDE.md).

## Trust boundaries

We designed QUOTA around prevention where we can get it, and detection where we can't — and we'd rather say that plainly than overclaim trustlessness.

- **ENS is the policy layer**: the season cap, yield ratios, season window, and minter roles all live in ENS v2 state on Sepolia — not in a database we control.
- **QuotaAnchor on Sepolia is the authorization record**: a mint is only legitimate if it has a matching ENS-authorized anchor event.
- **The relayer is bound to ENS state** and refuses to perform a Hedera mint if the season name it needs no longer resolves or the certifier lacks the `MINTER` role — demonstrated, not just described, in "ENS v2: making it load-bearing" above.
- **The subgraph is the detector**: it reconciles Hedera mirror-node mint history against Sepolia anchor events, so any mint that happened without a matching authorization is publicly visible.

One limitation we want to be explicit about: the Hedera account holding the token's `supplyKey` could mint directly, bypassing the relayer and ENS entirely — Hedera consensus has no knowledge of ENS or of Sepolia, so nothing on the Hedera side can technically stop that. What QUOTA guarantees is not that this is impossible, but that it cannot be hidden: an unauthorized mint would show up immediately in the subgraph as a mint with no corresponding anchor event.

The same framing applies to retirement-account outflows (see "Making retirement permanent" above — the retirement key is public by design, so an outflow is a real possibility, not a hypothetical one). Two different things catch it, and they are not equivalent coverage:
- **The subgraph is the actual detector.** Once built, it continuously reconciles full Hedera mirror-node transaction history for each retirement account against every `UnitsRetired` anchor event, so any outflow is caught regardless of when it happened or whether anything else runs afterward.
- **The relayer's balance check is an opportunistic tripwire, not the detector.** It compares a retirement account's current mirror-node balance against its anchored total, but only at the moment the relayer happens to be invoked for some other reason. It has no schedule and isn't watching continuously — an outflow that's later covered by a subsequent inflow before the relayer's next run could pass through unflagged by the tripwire specifically. The subgraph would still catch it independently once it exists, from the full history rather than a point-in-time balance.

## Status

All three layers are implemented and verified on testnet. Layer 1: the Hedera asset, its core invariant, and the retirement mechanism. Layer 2: `QuotaAnchor.sol` deployed and verified on Sepolia, reading the cap live from ENS. Layer 3: `quota.eth` → `bronte.quota.eth` → `2026.bronte.quota.eth` registered and load-bearing, with the kill test proven three ways above.

The subgraph's schema and mappings are written, and build clean (`graph codegen` / `graph build`). The mint-reconciliation detector is built, run, and verified against a real bypass mint — see above. What's outstanding is the actual `graph deploy` to Subgraph Studio: that requires a deploy key created by connecting a wallet in Studio's browser UI, which is not something this session can do on its own. See [`CLAUDE.md`](CLAUDE.md) for the current build breakdown.

## License

MIT — see [`LICENSE`](LICENSE).
