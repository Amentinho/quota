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

const registryAbi = JSON.parse(
  readFileSync(new URL("../ens/abi/PermissionedRegistry.abi.json", import.meta.url)),
);
const bronteRegistry = new ethers.Contract(process.env.ENS_BRONTE_REGISTRY_ADDRESS, registryAbi, provider);

// Known today because there's exactly one consortium and one season. Becomes
// a real lookup once Layer 3 has more than one.
const CONSORTIUM_ID = ethers.id("bronte");
const SEASON_ID = ethers.id("bronte-2026");
const SEASON_LABEL = "2026";
const MINTER_ROLE = 1n << 40n; // must match ens/roles.mjs and the contract's MINTER_ROLE

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
  console.log("Opening season -- cap will be read from ENS by the contract itself, not supplied here...");
  const node = ethers.namehash("2026.bronte.quota.eth");

  const tx = await anchor.openSeason(
    SEASON_ID,
    CONSORTIUM_ID,
    2026,
    process.env.ENS_BRONTE_REGISTRY_ADDRESS,
    SEASON_LABEL,
    process.env.ENS_RESOLVER_ADDRESS,
    node,
    hederaTokenId,
  );
  const receipt = await tx.wait();
  console.log("SeasonOpened anchored. Sepolia tx:", receipt.hash);
}

// "Resolves the season name before every mint and refuses if it doesn't
// resolve or the role is absent" -- an off-chain courtesy check so a bad
// call never even reaches the contract, not a substitute for the contract's
// own on-chain enforcement (which re-checks both independently).
async function checkSeasonAuthorization(certifier) {
  const resolverAddr = await bronteRegistry.getResolver(SEASON_LABEL);
  if (resolverAddr === ethers.ZeroAddress) {
    throw new Error(
      `REFUSED: "${SEASON_LABEL}.bronte.quota.eth" does not resolve (expired or unregistered). No transaction sent.`,
    );
  }

  const tokenId = await bronteRegistry.findTokenId(SEASON_LABEL);
  const hasMinterRole = await bronteRegistry.hasRoles(tokenId, MINTER_ROLE, certifier);
  if (!hasMinterRole) {
    throw new Error(
      `REFUSED: ${certifier} does not hold MINTER role for this season. No transaction sent.`,
    );
  }

  console.log(`  Season resolves (resolver ${resolverAddr}) and ${certifier} holds MINTER. Proceeding.`);
}

async function doMint(grams, certifier) {
  console.log(`Checking season authorization for certifier ${certifier}...`);
  await checkSeasonAuthorization(certifier);

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
    const tx = await anchor.recordMint(SEASON_ID, wallet.address, grams, hederaTxId, certifier);
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
    const certifier = args[1] || process.env.ENS_CERTIFIER_ADDRESS;
    if (!Number.isInteger(grams) || grams <= 0 || !certifier) {
      throw new Error("Usage: node scripts/relayer.mjs mint <grams> [certifierAddress]");
    }
    await doMint(grams, certifier);
  } else {
    console.log("Usage: node scripts/relayer.mjs <open-season|mint> [args]");
    process.exitCode = 1;
  }
} finally {
  hederaClient.close();
}
