import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

// Usage: node register-subname.mjs <parentRegistry> <label> <owner> <subregistry|none> <resolver> <expiryUnixSeconds> [extraRoleBitmapDecimal]
const [, , parentRegistryAddr, label, owner, subregistryArg, resolver, expiryArg, extraRoleBitmapArg] =
  process.argv;

if (!parentRegistryAddr || !label || !owner || !resolver || !expiryArg) {
  throw new Error(
    "Usage: node register-subname.mjs <parentRegistry> <label> <owner> <subregistry|none> <resolver> <expiryUnixSeconds> [extraRoleBitmapDecimal]",
  );
}

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const parentRegistry = new ethers.Contract(
  parentRegistryAddr,
  abi("PermissionedRegistry"),
  wallet,
);

const subregistry = subregistryArg === "none" ? ethers.ZeroAddress : subregistryArg;
const expiry = BigInt(expiryArg);
const extraRoleBitmap = extraRoleBitmapArg ? BigInt(extraRoleBitmapArg) : 0n;

console.log(`Registering "${label}" under ${parentRegistryAddr}...`);
console.log(`  owner: ${owner}`);
console.log(`  subregistry: ${subregistry}`);
console.log(`  resolver: ${resolver}`);
console.log(`  expiry: ${new Date(Number(expiry) * 1000).toISOString()}`);

const tx = await parentRegistry.register(
  label,
  owner,
  subregistry,
  resolver,
  extraRoleBitmap,
  expiry,
);
const receipt = await tx.wait();
console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
console.log("Tx:", receipt.hash);

const tokenId = await parentRegistry.findTokenId(label);
console.log("Token ID (resource for EAC roles):", tokenId.toString());
