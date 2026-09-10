import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const resolver = new ethers.Contract(process.env.ENS_RESOLVER_ADDRESS, abi("PermissionedResolverImpl"), wallet);

// Usage: node set-addr-record.mjs <fullName> <address>
// Sets the resolver's simple ETH addr() record for a name -- presentation
// only (a human-readable name for a role's address), never consulted by
// QuotaAnchor or any role check, which still go through hasRoles against
// the registry directly. The deployer holds SET_ADDR as a ROOT role on
// this shared resolver (granted once, at ens/register-root.mjs deploy
// time, covering every node in the tree) -- confirmed via hasRootRoles
// before writing this, not assumed from having successfully called
// setText before.
const [, , fullName, address] = process.argv;
if (!fullName || !address) {
  throw new Error("Usage: node set-addr-record.mjs <fullName> <address>");
}

const node = ethers.namehash(fullName);
console.log(`Setting addr record for ${fullName} (node ${node}) = ${address}`);

const tx = await resolver.setAddr(node, address);
const receipt = await tx.wait();
console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED", "-- tx", receipt.hash);

const readBack = await resolver.addr(node);
console.log("Read back from resolver:", readBack, readBack.toLowerCase() === address.toLowerCase() ? "(match)" : "(MISMATCH)");
