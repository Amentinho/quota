import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { MINTER_ROLE } from "./roles.mjs";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

export function bronteRegistryWrite(registryAddr, signerPrivateKey) {
  const wallet = new ethers.Wallet(signerPrivateKey, provider);
  return new ethers.Contract(registryAddr, abi("PermissionedRegistry"), wallet);
}

// Callable directly (by the demo server) or via the CLI below. Takes a
// resourceTokenId explicitly rather than looking it up here, since a
// resource ID isn't always the CLI's job to know -- see the caller-side
// note in app/server about looking this up live rather than trusting a
// cached value, after ENS_SEASON_TOKEN_ID in .env was once found stale
// (a TokenRegenerated event had moved it) by exactly this kind of thing.
//
// signerPrivateKey is explicit, not defaulted to the relayer's Sepolia key
// -- the Approver, not the relayer/infrastructure signer, is the one who
// actually holds MINTER_ROLE_ADMIN and is authorized to grant/revoke
// MINTER. Conflating the two would undermine the separation the three-tier
// structure (Consortium / Approver / Issuer) exists to enforce. See
// CLAUDE.md, "Three-level ENS permission structure."
// grantRoles/revokeRoles are idempotent on-chain -- granting a role that's
// already held, or revoking one that isn't, succeeds rather than reverts
// (that's ENS's contract, not ours, and not something to fight). But a
// no-op transaction still costs real gas for no real effect, so this
// checks hasRoles first and refuses off-chain, the same way the mint path
// already refuses via checkSeasonAuthorization before ever sending
// anything. Returns { noop: true, ... } instead of sending a transaction
// when the requested change wouldn't change anything.
export async function setMinterRole(action, registryAddr, resource, account, signerPrivateKey) {
  if (!["grant", "revoke"].includes(action)) {
    throw new Error(`setMinterRole: action must be "grant" or "revoke", got "${action}"`);
  }
  const registry = bronteRegistryWrite(registryAddr, signerPrivateKey);
  const method = action === "grant" ? "grantRoles" : "revokeRoles";

  const alreadyHasRole = await registry.hasRoles(BigInt(resource), MINTER_ROLE, account);
  if ((action === "grant" && alreadyHasRole) || (action === "revoke" && !alreadyHasRole)) {
    const message = `${account} ${alreadyHasRole ? "already holds" : "does not hold"} MINTER -- no transaction sent.`;
    console.log(message);
    return { noop: true, hasRoleNow: alreadyHasRole, message };
  }

  console.log(`${action === "grant" ? "Granting" : "Revoking"} MINTER role: resource ${resource}, account ${account}, signer ${registry.runner.address}`);

  const tx = await registry[method](BigInt(resource), MINTER_ROLE, account);
  const receipt = await tx.wait();
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED", "-- tx", receipt.hash);

  const has = await registry.hasRoles(BigInt(resource), MINTER_ROLE, account);
  console.log("hasRoles(MINTER) now:", has);

  return { txHash: receipt.hash, hasRoleNow: has, signer: registry.runner.address };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  // Usage: node grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account> [signerPrivateKey]
  // signerPrivateKey defaults to ENS_APPROVER_KEY -- the Approver is the
  // one who actually holds MINTER_ROLE_ADMIN post-rotation; pass a
  // different key explicitly only for a one-off case that needs it.
  const [, , action, registryAddr, resource, account, signerPrivateKey] = process.argv;
  if (!["grant", "revoke"].includes(action) || !registryAddr || !resource || !account) {
    throw new Error("Usage: node grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account> [signerPrivateKey]");
  }
  await setMinterRole(action, registryAddr, resource, account, signerPrivateKey || process.env.ENS_APPROVER_KEY);
}
