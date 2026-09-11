# QUOTA

Origin fraud in protected-designation food is not forged certificates. It's volume.

Bronte's harvest is biennial and small. The Consortium put 2023 production at roughly 2,000 tonnes — "poco più di un punto percentuale della produzione globale," just over one percentage point of world output, per Consortium president Enrico Cimbali ([Linkiesta](https://www.linkiesta.it/2025/02/pistacchio-bronte-dop-oro-verde-world-pistachio-day/), corroborated independently by [il Post](https://www.ilpost.it/2024/12/27/pistacchio-di-bronte/), which reports the identical figure and attribution). Sicily's regional government puts the biennial harvest at roughly 30,000 quintals — about 3,000 tonnes — every two years ([Regione Siciliana](https://terra.regione.sicilia.it/tra-rocce-vulcaniche-e-mercati-globali-il-viaggio-del-pistacchio-verde-di-bronte-dop/)). Wikipedia's own figures span 3,500 tonnes in 2012 down to 2,100 tonnes in 2021 — 0.25% of world production ([Wikipedia](https://it.wikipedia.org/wiki/Pistacchio_verde_di_Bronte)). These are area production figures, not certified DOP-labeled volumes; the actual DOP-certified tonnage is smaller than any of them, and "Bronte pistachio" sells worldwide, year-round, against a harvest this small.

The DOP designation exists because of exactly the problem QUOTA is built to solve: it was pursued starting in the late 1990s specifically in response to "numerosi casi di contraffazione e di uso improprio della dicitura 'di Bronte'" — counterfeiting and improper use of the words "di Bronte" — reaching formal EU recognition in 2009 ([Wikipedia](https://it.wikipedia.org/wiki/Pistacchio_verde_di_Bronte)). Twenty-five years on, the underlying problem hasn't gone away: in March 2021, Carabinieri seized roughly 650kg of pistachio product sold as "Pistacchio Verde di Bronte DOP" with no traceability system behind the claim at all ([Qualivita](https://www.qualivita.it/news/venduto-come-pistacchio-di-bronte-dop-era-senza-provenienza/)).

The number nobody can compute is how much product claims Bronte origin at any given moment — not fraud's share of it, just the claim itself — because there is no aggregate ledger of DOP claims anywhere: not at the Consortium, not at retail, not in this project's own retail scrape (see [`radar/`](radar/), which counts exactly two things — 16 retailers, 27 listings — and states plainly that neither can be reconciled against a harvest). QUOTA replaces attestation with a conservation law. A consortium mints exactly one origin unit per certified gram at harvest. Units move down the supply chain under transfer restrictions. Processing retires input units and mints derived units capped by a declared yield ratio. Units are retired at retail. Supply can never exceed the harvest, at any stage of the chain — not because a database says so, but because the underlying token supply physically cannot. QUOTA doesn't estimate the number nobody can compute today. It makes it computable.

## What's live, what's demo, what you can check

- **Live on Sepolia and Hedera testnet, right now, none of it mocked**: `QuotaAnchor.sol` (v7, verified on Etherscan/Blockscout/Sourcify), two Hedera HTS tokens (harvest and the derived kernel product), the ENS v2 registrations under `quota.eth`, and a Subgraph Studio deployment indexing all of it live. Every claim below links to the address, transaction, or endpoint that backs it — nothing here needs to be taken on trust.
- **Demo data, clearly labeled as such and nowhere presented as a market figure**: the harvest cap (3,400,000,000 grams — a round illustrative number in the ballpark of the real range cited above, not itself drawn from any single one of those sources) and the one real lot run through the full mint → transfer → transform → retire flow (1,000 grams — a demonstration quantity, not a claim about real harvest volume). The *mechanism* these numbers exercise — conservation enforced by token supply, a yield ratio enforced on-chain — is exactly what a real deployment at real harvest scale would run; only the numbers are demo-sized, not the logic.
- **What a judge can check without trusting this README**: the contract's verified source and every anchor event on [Etherscan](https://sepolia.etherscan.io/address/0x13A0Bb73C5a629dF1a8c91F99213d6077cc1acE2#code); every indexed entity via the [live subgraph endpoint](https://api.studio.thegraph.com/query/1758548/quota/v0.0.2) (three example queries below, with real returned output, not query text); the ENS names and their live expiry/role state directly on Sepolia (the dashboard's Season view reads this live, or query the registry yourself); and the [dashboard](https://quota-bronte.vercel.app) itself, which reads only these public sources and has no backend of its own.

## The cast

Five actors, three of them real-world roles with specific legal meaning under the EU's geographical-indication rules, two of them Hedera accounts:

- **Consortium** — the *Consorzio del Pistacchio Verde di Bronte DOP*. Owns the denomination (the legal right to the name "Pistacchio Verde di Bronte DOP," an EU Protected Designation of Origin) and the ENS name that represents it. Opens seasons and sets the harvest cap. **Does not certify individual producers.**
- **Control Body** — an accredited, independent inspector (Italian: *organismo di controllo*). Verifies producers and appoints or removes them as Issuers. **Cannot mint a single gram.** This split isn't an arbitrary design choice: EU geographical-indication rules require an independent control body precisely so a consortium can never certify itself. (This role was called "Approver" earlier in this build — renamed once it was clear the label said what the role could do, not who it is. See CLAUDE.md for what did and didn't change as a result.)
- **Issuer** — a certified producer. Mints only against its own certified harvest. **Cannot appoint or remove anyone.**
- **Treasury** — the Hedera account that holds newly minted grams until they're moved into processing.
- **Processor** — the Hedera account that holds grams mid-transformation, between the transfer step and the transform step.

A **season** is a single harvest year for a single denomination — `2026.bronte.quota.eth` is this project's one live season, the 2026 Bronte harvest. Each season has its own ENS name, its own cap, and its own Hedera token; a season's ENS expiry is the entire window during which minting is authorized for it, checked live by the contract on every mint attempt, not a separate timer this project maintains.

## The four proofs

Four different rules. Four different enforcement mechanisms — Hedera consensus, ENS role state, ENS role state again but a different role, and Sepolia reading an ENS record live. Not the same check four times. Three of the four are interactive in the dashboard's local-only Demo tab (see below for why that tab isn't part of the deployed site); all four have a real transaction a judge can open independently, or an honest statement of why there isn't one.

**Proof 1 — cap, enforced by Hedera consensus.**
What it does: mints harvest-token grams until the token's `maxSupply` (3,400,000,000 grams, fixed at creation) is reached, then mints one more.
What happens: every mint up to the cap succeeds; the next one is rejected by Hedera itself, not application code — status `TOKEN_MAX_SUPPLY_REACHED`, the network's own consensus refusing the transaction.
What it proves: the cap is a protocol-level guarantee, not a number this project's code happens to check.
Real transaction: [the actual failed mint on HashScan](https://hashscan.io/testnet/transaction/0.0.10323351-1788864821-400173065) — permanent, independently checkable. Not repeatable on demand (it would mean minting the full 3.4-billion-gram cap, which can't be undone afterward), so this is the original failure from when the invariant was first proven, not a re-enactment.

**Proof 2 — minting right, enforced by ENS.**
What it does: the Control Body revokes an Issuer's minting right, then that Issuer attempts to mint.
What happens: the revoke is a real transaction against the ENS registry on Sepolia. The mint attempt afterward is refused off-chain — the relayer reads the ENS registry directly before ever touching Hedera or Sepolia — so it produces no transaction of its own. That absence is the point: a bad mint attempt costs nothing and leaves nothing to unwind.
What it proves: the minting right is checked fresh on every attempt, not cached or assumed from a prior grant.
Real transaction: [the revoke itself, on Etherscan](https://sepolia.etherscan.io/tx/0x44a3ab69322758d48cce80aa261bd4174de4de63113d21a02ab560b0aceaa445) — real, signed by the Control Body's own key, status Success. The refused mint that follows it has no transaction hash to link, by design.

**Proof 3 — separation of powers, enforced by ENS.**
What it does: the Control Body — which holds the authority to appoint and remove Issuers — attempts to mint using its own address.
What happens: refused before any transaction is sent, every time. The Control Body's authority was established as admin-only from the moment it was granted; minting was never part of it.
What it proves: admin authority does not imply minting authority. The Control Body appoints every Issuer in this project and still cannot mint a gram.
Real transaction: [the registration that granted the Control Body its admin-only authority, on Etherscan](https://sepolia.etherscan.io/tx/0x63ed1ae9a1275ba69581f293d05165b0666fc40a35e5c3dc67ae7b1db7ad0d3f) — real, an ERC-1155 mint of the admin role token to the Control Body's address, nothing else. The refusal itself, like Proof 2's, produces no transaction — there's nothing to broadcast for an attempt the relayer's own off-chain check stops first.

**Proof 4 — yield ceiling, enforced on Sepolia against an ENS record.**
What it does: claims that processing consumed some input grams to produce a claimed output of kernel (the processed pistachio product).
What happens: `QuotaAnchor.recordTransform` reads the declared yield ratio live from ENS and computes the ceiling itself — a claim over the ceiling reverts on Sepolia before any Hedera token is touched (confirmed directly: the reverted call never even reaches the network, so there is no transaction hash for it, not just none we recorded); a claim at or under the ceiling succeeds, and the real Hedera legs — input retired, output minted — run only after.
What it proves: the yield ratio is enforced by the contract itself, reading it live from ENS on every call, not a number a caller gets to supply.
Real transaction: [a real transform at exactly the ceiling, on Etherscan](https://sepolia.etherscan.io/tx/0x24150928f10735b1bf373f8c5b2ce6e9a37fcad29e9f2b8d963b3794314177b9) — 100g in, 45g out, the season's 4500bp ceiling with zero headroom, `Record Transform` succeeding on-chain. The same check that allowed this reverts an over-ceiling claim before it ever becomes a transaction — verified directly against this contract while writing this section, not assumed: a deliberate `recordTransform` call claiming 100g out from 100g in (well over that input's 45g ceiling) produced a `CALL_EXCEPTION` with no `receipt` and no transaction hash at all — the revert happens during gas estimation, before anything is ever broadcast.

**Try these live.** The dashboard's Demo tab (source: `app/src/components/DemoView.tsx`) has three of these four wired up as real, clickable actions against this same contract and these same tokens — Proof 1 is the one exception, for the reason stated above. It's local-only, not part of the deployed site at [quota-bronte.vercel.app](https://quota-bronte.vercel.app): running it requires the Sepolia relayer key and the Control Body's own signing key in memory to sign real transactions on click, and putting either in a browser bundle or a public host would mean anyone who opens the site controls both. To run it, two terminals from the repo root:
```bash
# terminal 1 -- the local signing server
cd app/server && npm install && npm start   # node --env-file=../../.env index.mjs, binds 127.0.0.1 only
```
```bash
# terminal 2 -- the dashboard itself
cd app && npm run dev
```
Then open the dashboard's Demo tab (visible only under `npm run dev`, absent from `npm run build`'s output entirely — see `app/README.md`).

## Verify this yourself in 90 seconds

Four checks, each one click or one paste. No repo clone, no install, no keys — you're reading public state, not trusting this document.

**1. Open the [dashboard](https://quota-bronte.vercel.app), Solvency tab (the default view).**
You'll see: a cap of 3,400,000 kg for the 2026 harvest season, non-zero minted/retired figures, and a red detector-findings panel listing at least three entries — one badged **"Intentional demonstration"**, the rest badged **"Predates season re-open, real"**. Real numbers and real badges, not a blank or stuck-loading screen, means this step worked.

**2. Paste this into the live subgraph endpoint** — a terminal `curl`, or any GraphQL client, no login required:
```bash
curl -s -X POST https://api.studio.thegraph.com/query/1758548/quota/v0.0.2 \
  -H "Content-Type: application/json" \
  -d '{"query":"{ consortium(id: \"0x15b5c6738cfb5e2b01ba96ceeaa44f6d9c1f657b4f24f5df918008069f036c4c\") { seasons { id unauthorizedMints { grams hederaTxId transactionHash } } } }"}'
```
You'll see: a JSON object with a `seasons` array; the harvest season's `unauthorizedMints` array is non-empty, each entry carrying a real `hederaTxId` and `transactionHash` you can look up independently on HashScan and Etherscan. An empty array or a GraphQL error means this step failed — it should never be empty.

**3. Open the harvest token on [HashScan](https://hashscan.io/testnet/token/0.0.10411251).**
You'll see **Fungible Token**, a **MAX SUPPLY** of `3,400,000.000` sitting next to **TOTAL SUPPLY** (a capped number, not "unlimited" — that cap is the `FINITE` supply type doing its job even though HashScan's UI doesn't print the word itself), and under "Token Keys": `ADMIN KEY: None`, `FEE SCHEDULE KEY: None`, `PAUSE KEY: None`, `WIPE KEY: None` — each annotated immutable or "cannot be [x]". If any of those four shows a real key instead of `None`, the immutability claim in this README is false; this step exists so you can check that it isn't.

**4. On the [dashboard](https://quota-bronte.vercel.app), click the "Season" tab** — `2026.bronte.quota.eth` is already selected in its dropdown, no further clicks needed.
You'll see a "Text records" panel read live from Sepolia — `Cap (g)` reading `3400000000` and `Kernel yield (bp)` reading `4500`. These aren't numbers this README asserts; they're read from the same ENS resolver `QuotaAnchor` itself reads from at mint- and transform-time, live, in your own browser.

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

### Three-level permission structure, with no contract change

Three real-world roles, not an arbitrary hierarchy: the Consortium (the Consorzio del Pistacchio Verde di Bronte DOP) owns the denomination but does not certify producers; an independent **Control Body** (Italian: *organismo di controllo*, an accredited inspector — EU geographical-indication rules require this role to be separate from the consortium, precisely so a consortium can never certify itself) verifies producers and appoints them as Issuers, but never mints; Issuers (certified producers) mint against their own certified harvest. `MINTER_ROLE`'s own admin bit, `MINTER_ROLE_ADMIN` (`MINTER_ROLE << 128`), splits the single "certifier" role above into two distinct levels, entirely at the ENS layer — `QuotaAnchor` only ever does a read-only `hasRoles` check for `MINTER`, so nothing about the contract changes:

- **Consortium** — owns `bronte.quota.eth`, holds the parent registry's `REGISTRAR` role. Unchanged from above.
- **Control Body** — holds `MINTER_ROLE_ADMIN` on the season, not `MINTER`. Can grant and revoke `MINTER` on other addresses; cannot mint. A dedicated, freshly-derived keypair, never the relayer's own address — conflating the infrastructure signer with the Control Body would undermine the separation this exists to prove. (This role was named "Approver" earlier in this build; renamed once it was clear the vague label didn't say who the actor actually is — see CLAUDE.md.)
- **Issuer** — two addresses hold `MINTER`. Either can mint; neither can grant or revoke `MINTER` on anyone, including itself. (`ENS_CERTIFIER_ADDRESS` from the proofs below is now "Issuer 1" — same address, same role, extended terminology.)

**Getting `MINTER_ROLE_ADMIN` onto a genuinely new address turned out to need more than a `grantRoles` call**, confirmed empirically rather than assumed: `EnhancedAccessControl`'s generic "admin of role R is `R << 128`" scheme has no valid admin bit for a role that's already in the top half of the 256-bit space — `MINTER_ROLE_ADMIN` is bit 168, and `168 + 128 = 296` overflows a `uint256`, so the shift is simply discarded (`0`). A `grantRoles(tokenId, MINTER_ROLE_ADMIN, newAddress)` call from the *current* admin-bit holder reverts; so does `grantRootRoles`, since the deployer only holds the specific root bits granted at registry deployment (`REGISTRAR`, `REGISTRAR_ADMIN`, etc.), not a blanket root grant covering this custom bit. The only place an admin-tier bit can be assigned at all is `register()`'s `extraRoleBitmap` parameter — which grants it to exactly one address, the new owner. **Practical consequence: rotating who holds an admin-tier role isn't a grant, it's an unregister + re-register.** `ens/rotate-season-admin.mjs` does exactly that — it was run once, live, to move `MINTER_ROLE_ADMIN` from the relayer onto the Control Body's own address (`register(label, newOwner, subregistry, resolver, extraRoleBitmap, expiry)` with `newOwner` = the Control Body, `extraRoleBitmap = MINTER_ROLE_ADMIN`) — the identical bootstrap pattern already used once for `kernel-2026`'s role gap (see below). Resolver, node, and every text record survive the rotation untouched (they're keyed by `(resolver, node)`, neither of which unregister/re-register touches — confirmed by reading `quota.cap.g` and `quota.yield.kernel.bp` back afterward, not assumed); the season's *previous* admin holder — the relayer, from the original registration — keeps its grant on the now-superseded resource id, inert since nothing resolves through it anymore. Left as-is rather than cleaned up.

Proven, not just configured: the Control Body's own key — not the relayer's — signed real `grantRoles`/`revokeRoles` transactions granting `MINTER` to both issuers. A real 1-gram mint by Issuer 1 confirmed the whole pipeline still works post-rotation. And a mint attempt using the Control Body's own address as certifier was refused by the relayer's off-chain check before any transaction was sent:
```
REFUSED: 0x2006deb6e0E8ed48E2B2AfAf463Ae3E480B9E375 does not hold MINTER role
for "2026". No transaction sent.
```
Same refusal path as proof (b) below — holding `MINTER_ROLE_ADMIN` does not imply holding `MINTER`.

The ENS name for this role was renamed to match: `control-body.bronte.quota.eth` (was `approver.bronte.quota.eth` — unregistered and re-registered under the new label, same address, same non-transferable pattern as every other participant subname; cheap enough, and with no bearing on the actual `MINTER_ROLE_ADMIN` grant, which lives on the season resource, not this display-only subname, to do properly rather than leave the ENS name mismatched with the UI label).

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

**Three real bugs, found by running the reconciler, not by inspection.** First run compared Hedera's mint history against only the *current* `QuotaAnchor` address — every mint anchored against a now-superseded address (this project redeployed the contract several times over the build, each time for a real reason: closing the ENS TODO, adding the detector event, fixing a missing `seasonId`, adding lot tracking) came back as a false "unauthorized." Fixed by checking every deployed address's history, which is the correct design regardless of redeploy count. Second run *still* produced false positives: the transaction-ID normalizer used chained non-global `.replace()` calls, which only touch the first `.` in a `0.0.x` account ID — the same mistake as an earlier HashScan URL bug in this project, this time in a new place. Rewrote it as an explicit regex, verified independently, then reran. Third bug, found later: redeploying with a *changed event signature* (v7 added `lotRef` to `UnitsMinted`) changes that event's topic hash, so querying an older deployment with the newer ABI silently returns zero logs for it rather than erroring — every pre-v7 mint would have looked unmatched again. Fixed by giving each historical deployment its own ABI fragment matching what it actually emits.

**Clean result, verified, including a real mistake caught by the very detector this project built:** the live subgraph shows three `unauthorizedMints` for the harvest season, not one, and they aren't all the same kind of thing. **One** (`0.0.10323351-1788884980-415990532`, 1 gram) is the deliberate demonstration: minted via `scripts/mint-bypassing-relayer.mjs`, a permanent testing tool, specifically to prove the reconciler catches a mint with no anchor. **The other two** (`0.0.10323351-1788942883-550678980` and `0.0.10323351-1788942893-476657317`, 1000 grams each) are real mistakes, not staged: two mints sent through the relayer's `mint` command before `openSeason` had been re-run against a freshly redeployed contract, so they reverted at the anchor step with the Hedera leg already committed — exactly the discrepancy class the detector exists to catch, just not one we planted on purpose. Left in rather than cleaned up, because scrubbing them would mean showing a detector result that's tidier than what actually happened. The dashboard's Solvency view labels each finding with which of these it is, rather than showing three unlabeled entries a judge has to take on faith. The reconciler recognized every legitimately-anchored mint across every historical contract address in the same run.

### Three queries against the live endpoint

**Live endpoint:** `https://api.studio.thegraph.com/query/1758548/quota/v0.0.2`

That's all a judge needs — no API key, no wallet, nothing to install. POST any of the three queries below as JSON (`{"query": "..."}`) to that URL, or paste them into Subgraph Studio's own in-browser playground for the `quota` subgraph. If you want to sanity-check freshness first: `{ _meta { block { number } hasIndexingErrors } }` should show `hasIndexingErrors: false` and a block number close to Sepolia's current head.

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
Real returned JSON — both seasons this consortium has opened, harvest and the derived kernel product, same query shape for each:
```json
{
  "data": {
    "consortium": {
      "id": "0x15b5c6738cfb5e2b01ba96ceeaa44f6d9c1f657b4f24f5df918008069f036c4c",
      "seasons": [
        {
          "id": "0xa3a9424b15d3b3de2818cd4323cc8839989fa5deb7659db78756e4e1561a08d1",
          "year": "2026",
          "hederaTokenId": "0.0.10434455",
          "capGrams": "1530000000",
          "mintedGrams": "450",
          "retiredGrams": "450",
          "inCirculationGrams": "0",
          "utilisationBp": "0"
        },
        {
          "id": "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46",
          "year": "2026",
          "hederaTokenId": "0.0.10411251",
          "capGrams": "3400000000",
          "mintedGrams": "1000",
          "retiredGrams": "1000",
          "inCirculationGrams": "0",
          "utilisationBp": "0"
        }
      ]
    }
  }
}
```
`mintedGrams` counts only legitimately anchored mints — the unauthorized ones below are deliberately excluded from it and surfaced as fraud findings instead, never folded into the legitimate total. The kernel season's 450g is the real output of transforming the harvest season's 1000g at the 4500bp ratio declared on ENS — see "Transformation, made real" below.

**2. Fraud findings — both detector paths, for one consortium. This is the one a judge should check first.**
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
Real returned JSON — three findings, caught by the reconciler with no help from us pointing at them: the deliberate bypass mint from `scripts/mint-bypassing-relayer.mjs`, plus two genuinely accidental unanchored mints made while re-opening the harvest season on a freshly redeployed contract (left in rather than tidied away — see CLAUDE.md):
```json
{
  "data": {
    "consortium": {
      "seasons": [
        {
          "id": "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46",
          "unauthorizedMints": [
            {
              "grams": "1000",
              "hederaTxId": "0.0.10323351-1788942883-550678980",
              "blockTimestamp": "1788943068",
              "transactionHash": "0x28925701b54bb78b8ac910d1efd94b0b2121f085231d2aacfd01cb3dad829d90"
            },
            {
              "grams": "1000",
              "hederaTxId": "0.0.10323351-1788942893-476657317",
              "blockTimestamp": "1788943080",
              "transactionHash": "0x9cc964b4c6b00103647254f826494509d6b33cef807893f0a602e5fb536e4639"
            },
            {
              "grams": "1",
              "hederaTxId": "0.0.10323351-1788884980-415990532",
              "blockTimestamp": "1788943056",
              "transactionHash": "0xdb5c7062c3e2d5cbaea85eab0c53b4703541a600c45d6f9bb5caf09a66a9ef8e"
            }
          ],
          "unauthorizedRetirementOutflows": []
        }
      ]
    }
  }
}
```

**3. Lot traceability — a real lot's full journey, harvest through retirement.** `lots(where: { lotRef })` returns every `Lot` entity sharing that reference — one per season it ever touched, joined by `Transformation`:
```graphql
query LotJourney {
  lots(where: { lotRef: "lot-2026-003" }) {
    id
    season { id hederaTokenId }
    lotRef
    totalRetiredGrams
    mints { grams hederaTxId }
    retirements { grams hederaTxId }
    transformationsAsInput { inputGrams outputGrams productType yieldBp }
    transformationsAsOutput { inputGrams outputGrams productType yieldBp }
  }
}
```
Real returned JSON — two `Lot` entities for the same `lotRef`, one per season it passed through:
```json
{
  "data": {
    "lots": [
      {
        "id": "0xa3a9424b15d3b3de2818cd4323cc8839989fa5deb7659db78756e4e1561a08d1-lot-2026-003",
        "season": { "id": "0xa3a9424b15d3b3de2818cd4323cc8839989fa5deb7659db78756e4e1561a08d1", "hederaTokenId": "0.0.10434455" },
        "lotRef": "lot-2026-003",
        "totalRetiredGrams": "450",
        "mints": [{ "grams": "450", "hederaTxId": "0.0.10323351@1788942980.158307800" }],
        "retirements": [{ "grams": "450", "hederaTxId": "0.0.10323351@1788943011.642245160" }],
        "transformationsAsInput": [],
        "transformationsAsOutput": [{ "inputGrams": "1000", "outputGrams": "450", "productType": "kernel", "yieldBp": "4500" }]
      },
      {
        "id": "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46-lot-2026-003",
        "season": { "id": "0xa4baff5b7d3e9ce47e3883640443c4f96c3c9d5ab41ef2d6fb111aa877680d46", "hederaTokenId": "0.0.10411251" },
        "lotRef": "lot-2026-003",
        "totalRetiredGrams": "1000",
        "mints": [{ "grams": "1000", "hederaTxId": "0.0.10323351@1788942927.387159127" }],
        "retirements": [{ "grams": "1000", "hederaTxId": "0.0.10323351@1788942982.430440378" }],
        "transformationsAsInput": [{ "inputGrams": "1000", "outputGrams": "450", "productType": "kernel", "yieldBp": "4500" }],
        "transformationsAsOutput": []
      }
    ]
  }
}
```
Every gram here is conserved and checkable: 1000g minted at harvest, 1000g retired as transformation input, 450g minted as kernel output (exactly 1000g × 4500bp, floored), 450g retired as the finished product. See "Transformation, made real" and the dashboard's Chain view for the full step-by-step version of this same lot.

## Transformation, made real

A conservation-law system that only tracks harvest units isn't proving much — the harder claim is that mass balances across *processing*, where a harvest input becomes a different, smaller-quantity retail product at a declared ratio. This required real new infrastructure, not just a UI: a second Hedera token for the derived product (kernel), its own retirement account, a second ENS season (`kernel-2026.bronte.quota.eth`) with its own cap, and a contract change.

**The ratio is enforced on-chain now, not just computed.** Before this, `recordTransform` took a caller-supplied `yieldBp` and trusted it — the arithmetic was correct, but nothing stopped a bad `yieldBp` from being passed in. `QuotaAnchor` v7 reads `quota.yield.kernel.bp` live from ENS on every call, computes the ceiling itself, and takes a caller-*claimed* `outputGrams` instead of a caller-claimed ratio:
```
Claim 500g output from 1000g input (real ceiling is 450g): reverts "QuotaAnchor: output exceeds yield ceiling"
Claim 450g output from 1000g input (exactly the ceiling):   succeeds
```
No Hedera token is touched on the failing call — the relayer checks the ceiling on Sepolia first, before any real value moves, so a bad claim costs nothing to unwind.

**Input units are retired, not burned**, same principle as the harvest token: a real Hedera transfer moves the input grams to the harvest retirement account before the output is minted. Consumption is never destruction in this system, for either the harvest or the derived product.

**One real lot, run end to end, no seed data:** `mint 1000g` → `transfer 1000g` → `transform` (rejected once, then accepted at 450g) → input 1000g retired → output 450g minted → output 450g retired. Every step above is a real transaction with a real Hedera or Sepolia tx ID — see query 3 above or the dashboard's Chain view for the full trace.

## The dashboard

A Vite + React + TypeScript + Tailwind app (`app/`) reading directly from the live subgraph endpoint and directly from Sepolia (a public, keyless RPC — no backend, nothing to keep secret). Three views:
- **Solvency** — per consortium, per season: cap, minted, retired, in circulation, with detector findings shown inline next to the figures they qualify, not behind a separate tab.
- **Chain** — a real lot's journey: harvest mint, transfer, transformation (with the yield ratio the contract actually enforced), retirement — grams shown at every step.
- **Season** — the ENS name, its expiry, its text records, and current `MINTER` role holders, all read live from Sepolia, not cached and not from the subgraph.

**Live at: [`https://quota-bronte.vercel.app`](https://quota-bronte.vercel.app)** — no login, no wallet connection, nothing to configure. Reads a public Sepolia RPC and the live subgraph directly from the browser; the deployed bundle carries no API keys of any kind (checked directly against the shipped JS, not just the source).

## Architecture

Four layers, deliberately kept separate:

- **Layer 1 — the asset**, on Hedera testnet. One HTS fungible token per consortium-season, `FINITE` supply, `maxSupply` set once in grams at creation, no admin/wipe/pause keys. The cap is enforced by Hedera consensus, not by our code. The harvest token carries a fixed transfer fee denominated in HBAR (never in origin units — a fee paid in grams would destroy supply on every transfer, which is exactly the conservation law this token exists to prove). There is no `feeScheduleKey`, so the fee is immutable for the same reason the cap is: nothing about the token's terms can move after creation. On testnet the fee collector is our own operator account for simplicity; in a real consortium deployment it would be the consortium's own treasury account. A second token exists for the derived (kernel) product, same immutability properties, its `maxSupply` set to the harvest cap at the declared yield ratio.
- **Layer 2 — public accountability**, on Ethereum Sepolia. `QuotaAnchor.sol` records mint/transfer/transform/retire events for indexing. Deployed and verified on Etherscan, Blockscout, and Sourcify: [`0x13A0Bb73C5a629dF1a8c91F99213d6077cc1acE2`](https://sepolia.etherscan.io/address/0x13A0Bb73C5a629dF1a8c91F99213d6077cc1acE2#code). It stores almost nothing — the only state is the immutable `relayer` address allowed to call it, and one small struct per season recording where to look on ENS; everything else is emit-only. The cap it records at season open, and the yield ratio it enforces at transform, are both read live from the resolver at anchor time — never supplied by whoever calls the contract. See "ENS v2: making it load-bearing" and "Transformation, made real" above.
- **Layer 3 — ENS v2 on Sepolia**, load-bearing, not decoration. `quota.eth` → `bronte.quota.eth` → two seasons (`2026`, `kernel-2026`), all live on Sepolia testnet. Season subname expiry is the mint window. Enhanced Access Control scopes a `MINTER` role per season. Resolver text records are the canonical cap and yield-ratio parameters, read on-chain by the contract itself. Participant subnames are non-transferable and gate KYC. Full detail and the three-part proof below.
- **Layer 4 — the dashboard**, reading Layers 2 and 3 live, no backend of its own. See "The dashboard" above.

Full design detail lives in [`CLAUDE.md`](CLAUDE.md).

## Trust boundaries

We designed QUOTA around prevention where we can get it, and detection where we can't — and we'd rather say that plainly than overclaim trustlessness.

- **ENS is the policy layer**: the season cap, yield ratios, season window, and minter roles all live in ENS v2 state on Sepolia — not in a database we control.
- **QuotaAnchor on Sepolia is the authorization record**: a mint is only legitimate if it has a matching ENS-authorized anchor event.
- **The relayer is bound to ENS state** and refuses to perform a Hedera mint if the season name it needs no longer resolves or the certifier lacks the `MINTER` role — demonstrated, not just described, in "ENS v2: making it load-bearing" above.
- **The subgraph is the detector**: it reconciles Hedera mirror-node mint history against Sepolia anchor events, so any mint that happened without a matching authorization is publicly visible.

One limitation we want to be explicit about: the Hedera account holding the token's `supplyKey` could mint directly, bypassing the relayer and ENS entirely — Hedera consensus has no knowledge of ENS or of Sepolia, so nothing on the Hedera side can technically stop that. What QUOTA guarantees is not that this is impossible, but that it cannot be hidden: an unauthorized mint would show up immediately in the subgraph as a mint with no corresponding anchor event.

The same framing applies to retirement-account outflows (see "Making retirement permanent" above — the retirement key is public by design, so an outflow is a real possibility, not a hypothetical one) — but the coverage here is genuinely weaker than for mints, and that asymmetry is worth stating plainly rather than glossing over:
- **Mints have a real, full-history detector.** `reconcile-mints` fetches the complete Hedera mirror-node mint history and compares it against every `UnitsMinted` anchor event ever recorded, across every contract address this project has deployed — see "The subgraph: composable across consortia, and an actual detector" above. Any unauthorized mint, however old, gets caught the next time it runs, and the finding is anchored and indexed permanently.
- **Retirement outflows have no equivalent.** The only check built is `checkRetirementTripwire` — a point-in-time comparison of a retirement account's current mirror-node balance against its anchored total, run opportunistically whenever the relayer happens to execute for some other reason. It has no schedule, does not look at transaction history the way `reconcile-mints` does, and an outflow later covered by a subsequent inflow before the tripwire's next run could pass through unflagged. `RetirementOutflowDetected` and its subgraph entity work correctly when the tripwire does fire — what's missing is a `reconcile-mints`-equivalent for retirements (full mirror-node history vs. every `UnitsRetired` anchor), not the anchoring or indexing path itself. Building that is the natural next step if this project continues; it is not built today.

One more limitation worth naming rather than leaving for a judge to find: **custody transfers are real on Hedera, but the Sepolia anchor for them carries no custody information.** `recordTransfer`'s `from`/`to` parameters are Ethereum addresses, and a Hedera account ID (the account that actually sent or received the tokens, e.g. the operator or the processor) has no Ethereum-address equivalent to anchor instead — so every `UnitsTransferred` event this relayer has ever emitted names its own Sepolia signer address on both sides. The grams and the timing anchored are real and correct; which Hedera account actually held custody before and after is not recoverable from the anchor record, only from the Hedera transaction itself. This doesn't weaken conservation (mint/transform/retirement are grams-exact and fully anchored, independent of this) or the mint/retirement-outflow detectors above — it only means the anchor layer can't yet answer "which account held this lot's custody at time T" the way it can answer "how many grams exist." The dashboard's Chain view reflects this honestly: it drops same-address transfer entries from a lot's rendered journey rather than showing a "0x2f7e… → 0x2f7e…" card that looks like a custody move but isn't backed by one. Anchoring real Hedera-account identity is contract-level work, not built today.

## Status

All four layers are implemented and verified on testnet. Layer 1: two Hedera assets (harvest and kernel), their core invariant, and both retirement mechanisms. Layer 2: `QuotaAnchor.sol` v7 deployed and verified on Sepolia, reading the cap and yield ratio live from ENS and enforcing the latter as an on-chain ceiling. Layer 3: `quota.eth` → `bronte.quota.eth` → two seasons, registered and load-bearing, with the kill test proven three ways above.

The subgraph is deployed for real to Subgraph Studio and synced to chain head — live at `https://api.studio.thegraph.com/query/1758548/quota/v0.0.2`. The mint-reconciliation detector is built, run, and verified against three real findings (one deliberate bypass, two accidental). One real lot has been run fully end to end — mint, transfer, transform (with a proven ceiling rejection), and retirement on both the input and output side — and is queryable via query 3 above.

Layer 4, the dashboard, is deployed to Vercel and verified live — all three views checked directly against the production build (not just local dev), console clean, and the shipped JS bundle confirmed to carry no keys. See "The dashboard" above for the URL. See [`CLAUDE.md`](CLAUDE.md) for the current build breakdown.

## License

MIT — see [`LICENSE`](LICENSE).
