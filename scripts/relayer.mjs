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

// Normalizes both Hedera transaction ID formats -- the SDK's
// "0.0.x@seconds.nanos" (what we store in anchor events) and the mirror
// node's "0.0.x-seconds-nanos" (what its API returns) -- to one comparable
// string, so the two histories can actually be diffed against each other.
//
// A naive .replace("@","-").replace(".","-") (tried first) silently fails:
// String.replace with a plain string argument only replaces the FIRST
// occurrence, and the account portion "0.0.x" already contains dots, so
// the second .replace() hits the wrong dot and neither format ends up
// canonicalized consistently. This produced real false positives --
// legitimately anchored mints reported as unmatched -- caught by manually
// cross-checking a result against known-anchored transactions, not by
// inspection. Same class of bug as the HashScan URL fix earlier in this
// project: parse the fixed structure explicitly rather than chained
// single-replace calls.
function normalizeHederaTxId(id) {
  const match = id.match(/^(\d+\.\d+\.\d+)[@-](\d+)[.-](\d+)$/);
  if (!match) throw new Error(`Unrecognized Hedera transaction ID format: ${id}`);
  const [, account, seconds, nanos] = match;
  return `${account}-${seconds}-${nanos}`;
}

// Every QuotaAnchor address this project has ever deployed, each a fresh
// contract with its own empty event history. A reconciler that only checks
// the CURRENT address would misreport every mint anchored against an
// earlier (now-superseded) instance as unauthorized -- found exactly this
// way, empirically, not anticipated in advance. A production deployment
// without mid-build redeploys wouldn't need this list, but the lesson
// generalizes: "unauthorized" must mean "unanchored anywhere we've ever
// anchored," not "unanchored on whichever address I happened to check."
const ALL_ANCHOR_DEPLOYMENTS = [
  { address: "0x86b0A1F99D56830248622a3866457fA59442abdc", deployBlock: 11661523 }, // v1
  { address: "0xD844dF6A6A15ce24dB99b65A45311070506F8A9B", deployBlock: 11661839 }, // v2
  { address: "0xeA5dD3615e97b3Bfe67f3819F2c80Ce4FB8106c4", deployBlock: 11662146 }, // v3
  { address: "0xec7B4666c06dB283Cf5f58Bab7dEDFC522092832", deployBlock: 11662163 }, // v4
  { address: "0x717DF23aB2f875E81F2646141A45c2db82513977", deployBlock: 11662208 }, // v5
  { address: process.env.QUOTA_ANCHOR_ADDRESS, deployBlock: Number(process.env.QUOTA_ANCHOR_DEPLOY_BLOCK) }, // current
];

// THE DETECTOR's bridge (see CLAUDE.md): subgraph mappings can't call the
// Hedera mirror node directly, so this off-chain reconciler fetches the
// full Hedera mint history for the token, fetches the full UnitsMinted
// anchor history from every QuotaAnchor instance ever deployed, and anchors
// UnauthorizedMintDetected (on the current contract) for any Hedera mint
// with no matching anchor anywhere. The subgraph only ever indexes the
// anchor events this produces -- it never talks to Hedera itself.
async function reconcileMints() {
  console.log(`Reconciling Hedera mint history for token ${hederaTokenId} against Sepolia anchors...`);

  // Mints before the anchor system existed aren't in scope: "unanchored" is
  // their expected, correct state, not a finding. Cutoff sits between the
  // last pre-system mint (the 4c invariant-proof remint, ~1788864838) and
  // the first-ever anchored mint (~1788876544) -- found and set after
  // running without it once and seeing exactly this class of false result.
  const ANCHOR_SYSTEM_START_SECONDS = 1788870000;

  const mintTxs = [];
  let url = `https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=${process.env.HEDERA_OPERATOR_ID}&transactiontype=TOKENMINT&order=asc&limit=100&timestamp=gt:${ANCHOR_SYSTEM_START_SECONDS}`;
  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    for (const tx of data.transactions ?? []) {
      const transfer = (tx.token_transfers ?? []).find(
        (t) => t.token_id === hederaTokenId && t.amount > 0,
      );
      if (transfer) {
        mintTxs.push({ hederaTxId: tx.transaction_id, grams: BigInt(transfer.amount) });
      }
    }
    url = data.links?.next ? `https://testnet.mirrornode.hedera.com${data.links.next}` : null;
  }
  console.log(`  Hedera mirror node: ${mintTxs.length} mint transaction(s) for this token.`);

  const artifact = JSON.parse(
    readFileSync(new URL("../contracts/artifacts/contracts/QuotaAnchor.sol/QuotaAnchor.json", import.meta.url)),
  );
  const anchoredTxIds = new Set();
  for (const { address, deployBlock } of ALL_ANCHOR_DEPLOYMENTS) {
    const c = new ethers.Contract(address, artifact.abi, provider);
    const events = await c.queryFilter(c.filters.UnitsMinted(), deployBlock);
    for (const e of events) anchoredTxIds.add(normalizeHederaTxId(e.args.hederaTxId));
  }
  console.log(`  Anchored across all ${ALL_ANCHOR_DEPLOYMENTS.length} deployed contract instances: ${anchoredTxIds.size} UnitsMinted event(s).`);

  const unmatched = mintTxs.filter((tx) => !anchoredTxIds.has(normalizeHederaTxId(tx.hederaTxId)));

  if (unmatched.length === 0) {
    console.log("  Every Hedera mint has a matching anchor. Nothing to flag.");
    return;
  }

  for (const tx of unmatched) {
    console.error(`UNMATCHED MINT: Hedera tx ${tx.hederaTxId}, ${tx.grams} grams, no matching anchor anywhere.`);
    const anchorTx = await anchor.recordUnauthorizedMint(SEASON_ID, tx.grams, tx.hederaTxId);
    const receipt = await anchorTx.wait();
    console.error("Anchored as UnauthorizedMintDetected. Sepolia tx:", receipt.hash);
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
  } else if (command === "reconcile-mints") {
    await reconcileMints();
  } else {
    console.log("Usage: node scripts/relayer.mjs <open-season|mint|reconcile-mints> [args]");
    process.exitCode = 1;
  }
} finally {
  hederaClient.close();
}
