import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const resolver = new ethers.Contract(process.env.ENS_RESOLVER_ADDRESS, abi("PermissionedResolverImpl"), wallet);

const NAME = "2026.bronte.quota.eth";
const node = ethers.namehash(NAME);
console.log(`Setting text records for ${NAME} (node ${node})`);

const records = {
  "quota.unit": "g",
  "quota.cap.g": "3400000000",
  "quota.token.hedera": process.env.HEDERA_TOKEN_ID,
  "quota.yield.kernel.bp": "4500",
  "quota.yield.cream.bp": "4000",
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
