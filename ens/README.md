# ens

Subname registration, EAC role grants, and resolver text records — the policy layer (Layer 3). Live on Sepolia testnet: `quota.eth` → `bronte.quota.eth` → `2026.bronte.quota.eth` (season) and `rossi.bronte.quota.eth` (participant, non-transferable). See CLAUDE.md for addresses and the two non-obvious findings from actually registering these (payment token, expiry-gating asymmetry).

Run from the repo root so `--env-file` finds `.env`. Order matters — each script depends on state the previous one created:

```
node --env-file=.env ens/register-root.mjs
```
One-time: registers `quota.eth` itself (commit-reveal, paid in MockDAI — a testnet mock token with a public `mint()`, not ETH), deploying its own subregistry and one shared resolver first. Records `ENS_QUOTA_REGISTRY_ADDRESS` and `ENS_RESOLVER_ADDRESS` in `.env`.

```
node --env-file=.env ens/deploy-registry.mjs [rootAccount]
```
Deploys a fresh `PermissionedRegistry` proxy instance via `VerifiableFactory`, granting `rootAccount` (defaults to the deployer) registry-management roles on it. Needed once per name that will itself hold further subnames — used for `bronte.quota.eth`.

```
node --env-file=.env ens/register-subname.mjs <parentRegistry> <label> <owner> <subregistry|none> <resolver> <expiryUnixSeconds> [extraRoleBitmapDecimal]
```
Registers one subname directly on its parent's registry. `subregistry` is `none` for a leaf name (nothing needs to be registered under it). Used for `bronte`, `2026`, and `rossi`.

```
node --env-file=.env ens/set-text-records.mjs
```
Sets the season's canonical parameters on the shared resolver (`quota.unit`, `quota.cap.g`, `quota.token.hedera`, `quota.yield.kernel.bp`, `quota.yield.cream.bp`) and reads them back from the resolver to confirm, rather than trusting the write.

```
node --env-file=.env ens/grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account>
```
Grants or revokes the custom `MINTER` role (`ens/roles.mjs` — a bit ENSv2's own `RegistryRolesLib` leaves unused) on a season's resource. This is what proof (b) under README revokes and re-grants.

`ens/addresses.mjs` and `ens/roles.mjs` hold the deployment addresses and role-bit constants used throughout — pulled from Etherscan's verified source for the live Sepolia contracts, not guessed. `ens/abi/*.abi.json` are the exact ABIs fetched the same way.
