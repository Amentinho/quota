import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const resolver = new ethers.Contract(process.env.ENS_RESOLVER_ADDRESS, abi("PermissionedResolverImpl"), wallet);

const NAME = "kernel-2026.bronte.quota.eth";
const node = ethers.namehash(NAME);
console.log(`Setting text records for ${NAME} (node ${node})`);

// The output season's own cap, read by QuotaAnchor.openSeason the same way
// as the harvest season's -- not derived on-chain from the yield ratio,
// set directly as the output product's own declared ceiling (here: the
// harvest cap at the 4500bp kernel yield, computed off-chain once and
// published as a plain value, same as every other cap in this project).
const records = {
  "quota.unit": "g",
  "quota.cap.g": "1530000000",
  "quota.token.hedera": process.env.HEDERA_KERNEL_TOKEN_ID,
};

for (const [key, value] of Object.entries(records)) {
  const tx = await resolver.setText(node, key, value);
  const receipt = await tx.wait();
  console.log(`  ${key} = "${value}" -- status ${receipt.status === 1 ? "SUCCESS" : "FAILED"} (tx ${receipt.hash})`);
}

console.log("\nReading back to confirm (from the resolver, not from what we just sent):");
for (const key of Object.keys(records)) {
  const value = await resolver.text(node, key);
  console.log(`  ${key} = "${value}"`);
}
