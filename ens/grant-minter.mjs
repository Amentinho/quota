import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { MINTER_ROLE } from "./roles.mjs";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);

export function bronteRegistryWrite(registryAddr) {
  return new ethers.Contract(registryAddr, abi("PermissionedRegistry"), wallet);
}

// Callable directly (by the demo server) or via the CLI below. Takes a
// resourceTokenId explicitly rather than looking it up here, since a
// resource ID isn't always the CLI's job to know -- see the caller-side
// note in app/server about looking this up live rather than trusting a
// cached value, after ENS_SEASON_TOKEN_ID in .env was once found stale
// (a TokenRegenerated event had moved it) by exactly this kind of thing.
export async function setMinterRole(action, registryAddr, resource, account) {
  if (!["grant", "revoke"].includes(action)) {
    throw new Error(`setMinterRole: action must be "grant" or "revoke", got "${action}"`);
  }
  const registry = bronteRegistryWrite(registryAddr);
  const method = action === "grant" ? "grantRoles" : "revokeRoles";
  console.log(`${action === "grant" ? "Granting" : "Revoking"} MINTER role: resource ${resource}, account ${account}`);

  const tx = await registry[method](BigInt(resource), MINTER_ROLE, account);
  const receipt = await tx.wait();
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED", "-- tx", receipt.hash);

  const has = await registry.hasRoles(BigInt(resource), MINTER_ROLE, account);
  console.log("hasRoles(MINTER) now:", has);

  return { txHash: receipt.hash, hasRoleNow: has };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  // Usage: node grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account>
  const [, , action, registryAddr, resource, account] = process.argv;
  if (!["grant", "revoke"].includes(action) || !registryAddr || !resource || !account) {
    throw new Error("Usage: node grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account>");
  }
  await setMinterRole(action, registryAddr, resource, account);
}
