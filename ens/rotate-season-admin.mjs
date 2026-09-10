import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

// Moves a season's admin-tier role bitmap onto a NEW owner address by
// unregistering and re-registering the label. This is the only way to get
// an ADMIN-tier bit (e.g. MINTER_ROLE_ADMIN, bit 168) onto an address that
// doesn't already hold it: EnhancedAccessControl's generic "admin of role
// R is R << 128" scheme has no valid admin bit for a role that's already
// in the top half of the 256-bit space (168 + 128 = 296, which overflows
// a uint256 and is discarded by SHL, i.e. becomes 0) -- confirmed
// empirically, not assumed: a resource-scoped grantRoles(tokenId,
// MINTER_ROLE_ADMIN, ...) call from the CURRENT admin-bit holder reverts.
// grantRootRoles reverts too -- the deployer only holds specific root bits
// (REGISTRAR, REGISTRAR_ADMIN, etc. from ens/deploy-registry.mjs's initial
// roleBitmap), not a blanket root grant covering QUOTA's custom bits. The
// ONLY place an ADMIN-tier bit can be assigned is register()'s
// extraRoleBitmap, which grants it to exactly one address: the new owner.
// Same pattern already used once for kernel-2026's role-bootstrap gap (see
// CLAUDE.md, "Enforcing the yield ceiling on-chain").
//
// Resolver, subregistry and the label's node (namehash) are unchanged, so
// every text record already set on this season survives untouched -- they
// are keyed by (resolver, node), neither of which this touches.
//
// Usage: node rotate-season-admin.mjs <parentRegistry> <label> <newOwner> <resolver> <extraRoleBitmapDecimal> <expiryUnixSeconds>
const [, , parentRegistryAddr, label, newOwner, resolver, extraRoleBitmapArg, expiryArg] = process.argv;
if (!parentRegistryAddr || !label || !newOwner || !resolver || !extraRoleBitmapArg || !expiryArg) {
  throw new Error(
    "Usage: node rotate-season-admin.mjs <parentRegistry> <label> <newOwner> <resolver> <extraRoleBitmapDecimal> <expiryUnixSeconds>",
  );
}

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const registry = new ethers.Contract(parentRegistryAddr, abi("PermissionedRegistry"), wallet);

const oldTokenId = await registry.findTokenId(label);
console.log(`Current tokenId for "${label}": ${oldTokenId}`);
console.log("Unregistering (the deployer's REGISTRAR/UNREGISTER root roles on the parent registry authorize this -- a separate authority from anything held on the season resource itself)...");

const unregisterTx = await registry.unregister(oldTokenId);
const unregisterReceipt = await unregisterTx.wait();
console.log("Unregister status:", unregisterReceipt.status === 1 ? "SUCCESS" : "FAILED", "-- tx", unregisterReceipt.hash);

const extraRoleBitmap = BigInt(extraRoleBitmapArg);
const expiry = BigInt(expiryArg);
console.log(`Re-registering "${label}" with owner ${newOwner}, extraRoleBitmap ${extraRoleBitmap.toString(2)} (binary)...`);

const registerTx = await registry.register(label, newOwner, ethers.ZeroAddress, resolver, extraRoleBitmap, expiry);
const registerReceipt = await registerTx.wait();
console.log("Register status:", registerReceipt.status === 1 ? "SUCCESS" : "FAILED", "-- tx", registerReceipt.hash);

const newTokenId = await registry.findTokenId(label);
console.log(`New tokenId for "${label}": ${newTokenId}`);
console.log(`New expiry: ${new Date(Number(expiry) * 1000).toISOString()}`);
