import { readFileSync, appendFileSync } from "node:fs";
import { ethers } from "ethers";

const artifact = JSON.parse(
  readFileSync(
    new URL("./artifacts/contracts/QuotaAnchor.sol/QuotaAnchor.json", import.meta.url),
  ),
);

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);

console.log("Deployer / relayer address:", wallet.address);

const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
// The deployer is also the relayer -- one funded dev wallet plays both roles.
const contract = await factory.deploy(wallet.address);
await contract.waitForDeployment();

const address = await contract.getAddress();
const deployTx = contract.deploymentTransaction();

console.log("QuotaAnchor deployed:", address);
console.log("Deployment tx hash:", deployTx.hash);

appendFileSync(new URL("../.env", import.meta.url), `QUOTA_ANCHOR_ADDRESS=${address}\n`);
console.log("Address written to .env as QUOTA_ANCHOR_ADDRESS");
