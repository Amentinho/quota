import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { MINTER_ROLE } from "./roles.mjs";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

// Usage: node grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account>
const [, , action, registryAddr, resource, account] = process.argv;
if (!["grant", "revoke"].includes(action) || !registryAddr || !resource || !account) {
  throw new Error("Usage: node grant-minter.mjs <grant|revoke> <registryAddress> <resourceTokenId> <account>");
}

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const registry = new ethers.Contract(registryAddr, abi("PermissionedRegistry"), wallet);

const method = action === "grant" ? "grantRoles" : "revokeRoles";
console.log(`${action === "grant" ? "Granting" : "Revoking"} MINTER role: resource ${resource}, account ${account}`);

const tx = await registry[method](BigInt(resource), MINTER_ROLE, account);
const receipt = await tx.wait();
console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED", "-- tx", receipt.hash);

const has = await registry.hasRoles(BigInt(resource), MINTER_ROLE, account);
console.log("hasRoles(MINTER) now:", has);
