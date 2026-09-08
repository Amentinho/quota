import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { Client, PrivateKey, AccountId, TokenMintTransaction } from "@hashgraph/sdk";

const hederaOperatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const hederaOperatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const hederaTokenId = process.env.HEDERA_TOKEN_ID;
const retirementAccountId = process.env.HEDERA_RETIREMENT_ACCOUNT_ID;
const hederaClient = Client.forTestnet().setOperator(hederaOperatorId, hederaOperatorKey);

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../contracts/artifacts/contracts/QuotaAnchor.sol/QuotaAnchor.json",
      import.meta.url,
    ),
  ),
);
const anchor = new ethers.Contract(process.env.QUOTA_ANCHOR_ADDRESS, artifact.abi, wallet);

// Known today because there's exactly one consortium and one season. Becomes
// a real lookup once Layer 3 (ENS) exists and there's more than one.
const CONSORTIUM_ID = ethers.id("bronte");
const SEASON_ID = ethers.id("bronte-2026");

// Opportunistic tripwire, not the detector. The subgraph, reconciling full
// Hedera mirror-node history against every anchor event, is what actually
// catches an outflow. This only checks the retirement account's CURRENT
// balance against anchored totals, and only when the relayer happens to run
// for some other reason -- it does not watch continuously and can miss an
// outflow that's later covered by a subsequent inflow before this ever runs.
async function checkRetirementTripwire() {
  console.log("Retirement tripwire: comparing anchored total to Hedera mirror-node balance...");

  // fromBlock matters: the public RPC caps eth_getLogs at a 50,000-block
  // range, so querying from block 0 fails outright on a chain this tall.
  const deployBlock = Number(process.env.QUOTA_ANCHOR_DEPLOY_BLOCK);
  const events = await anchor.queryFilter(anchor.filters.UnitsRetired(), deployBlock);
  const anchoredTotal = events.reduce((sum, e) => sum + e.args.grams, 0n);

  const res = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/tokens/${hederaTokenId}/balances?account.id=${retirementAccountId}`,
  );
  const data = await res.json();
  const actualBalance = BigInt(data.balances[0]?.balance ?? 0);

  console.log(`  anchored total retired: ${anchoredTotal}, actual mirror-node balance: ${actualBalance}`);

  if (actualBalance < anchoredTotal) {
    const shortfall = anchoredTotal - actualBalance;
    console.error(`RETIREMENT OUTFLOW DETECTED: shortfall of ${shortfall} grams.`);
    const tx = await anchor.recordRetirementOutflow(SEASON_ID, shortfall, "unattributed");
    const receipt = await tx.wait();
    console.error("Anchored as RetirementOutflowDetected. Sepolia tx:", receipt.hash);
  } else {
    console.log("  no shortfall -- tripwire quiet this run.");
  }
}

async function doOpenSeason() {
  console.log("Opening season (anchor-only; the Hedera token already exists, nothing to do there)...");
  const capGrams = 3_400_000_000n; // real known cap, caller-supplied -- see contract TODO(ENS)
  const ensNode = ethers.ZeroHash; // no ENS node yet: Layer 3 doesn't exist. Zero means "not linked", not a faked value.

  const tx = await anchor.openSeason(CONSORTIUM_ID, 2026, capGrams, hederaTokenId, ensNode);
  const receipt = await tx.wait();
  console.log("SeasonOpened anchored. Sepolia tx:", receipt.hash);
}

async function doMint(grams) {
  console.log(`Minting ${grams} grams on Hedera (token ${hederaTokenId})...`);
  const mintSubmit = await new TokenMintTransaction()
    .setTokenId(hederaTokenId)
    .setAmount(grams)
    .execute(hederaClient);
  const mintReceipt = await mintSubmit.getReceipt(hederaClient);

  if (mintReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Hedera mint failed: ${mintReceipt.status.toString()}`);
  }

  const hederaTxId = mintSubmit.transactionId.toString();
  console.log("Hedera mint SUCCESS.");
  console.log("Hedera tx ID:", hederaTxId);
  // HashScan's URL format keeps the dots in the account ID and only
  // replaces "@" and the timestamp's internal "." with "-" -- verified
  // against a real transaction page, not guessed.
  const [account, timestamp] = hederaTxId.split("@");
  console.log(
    "HashScan:",
    `https://hashscan.io/testnet/transaction/${account}-${timestamp.replace(".", "-")}`,
  );

  console.log("Anchoring on Sepolia...");
  try {
    const tx = await anchor.recordMint(SEASON_ID, wallet.address, grams, hederaTxId);
    const receipt = await tx.wait();
    console.log("Anchored. Sepolia tx:", receipt.hash);
    console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${receipt.hash}`);
  } catch (err) {
    console.error("=".repeat(70));
    console.error("ANCHOR FAILED after a SUCCESSFUL Hedera mint.");
    console.error(`Hedera tx ${hederaTxId} minted ${grams} grams with no matching anchor event.`);
    console.error("This is exactly the discrepancy the subgraph detector exists to catch.");
    console.error(err.message);
    console.error("=".repeat(70));
    process.exitCode = 1;
    throw err;
  }
}

const [, , command, ...args] = process.argv;

try {
  await checkRetirementTripwire();

  if (command === "open-season") {
    await doOpenSeason();
  } else if (command === "mint") {
    const grams = Number(args[0]);
    if (!Number.isInteger(grams) || grams <= 0) {
      throw new Error("Usage: node scripts/relayer.mjs mint <grams>");
    }
    await doMint(grams);
  } else {
    console.log("Usage: node scripts/relayer.mjs <open-season|mint> [args]");
    process.exitCode = 1;
  }
} finally {
  hederaClient.close();
}
