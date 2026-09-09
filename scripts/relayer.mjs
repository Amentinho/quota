import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ethers } from "ethers";
import { Client, PrivateKey, AccountId, Hbar, TokenMintTransaction, TransferTransaction } from "@hashgraph/sdk";

const hederaOperatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const hederaOperatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const hederaTokenId = process.env.HEDERA_TOKEN_ID;
const kernelTokenId = process.env.HEDERA_KERNEL_TOKEN_ID;
const retirementAccountId = process.env.HEDERA_RETIREMENT_ACCOUNT_ID;
const kernelRetirementAccountId = process.env.HEDERA_KERNEL_RETIREMENT_ACCOUNT_ID;
const processorAccountId = process.env.HEDERA_PROCESSOR_ACCOUNT_ID;
export const hederaClient = Client.forTestnet().setOperator(hederaOperatorId, hederaOperatorKey);

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
export const bronteRegistry = new ethers.Contract(process.env.ENS_BRONTE_REGISTRY_ADDRESS, registryAbi, provider);

// Known today because there's exactly one consortium. Becomes a real lookup
// once Layer 3 has more than one.
export const CONSORTIUM_ID = ethers.id("bronte");
export const SEASON_ID = ethers.id("bronte-2026");
export const SEASON_LABEL = "2026";
export const KERNEL_SEASON_ID = ethers.id("bronte-2026-kernel");
export const KERNEL_SEASON_LABEL = "kernel-2026";
const MINTER_ROLE = 1n << 40n; // must match ens/roles.mjs and the contract's MINTER_ROLE

// Same derivation scheme as the retirement account (see CLAUDE.md, "Making
// retirement permanent"), reused for the processor account that holds
// harvest-token custody between transfer and transform. Recomputed here
// rather than stored, exactly like the retirement account's key never is --
// there is nothing secret about it.
function deriveKey(seedInput) {
  return PrivateKey.fromBytesED25519(createHash("sha256").update(seedInput).digest());
}
const processorKey = deriveKey(`QUOTA-PROCESSOR-${hederaTokenId}`);

// Opportunistic tripwire, not the detector. The subgraph, reconciling full
// Hedera mirror-node history against every anchor event, is what actually
// catches an outflow. This only checks each retirement account's CURRENT
// balance against its own season's anchored total, and only when the
// relayer happens to run for some other reason -- it does not watch
// continuously and can miss an outflow that's later covered by a
// subsequent inflow before this ever runs. Scoped per season/token/account
// -- checking un-scoped (summing every UnitsRetired regardless of season)
// would compare a harvest+kernel combined total against only one account's
// balance the moment a second season starts retiring, producing a false
// mismatch. Found while wiring up the kernel retirement account, fixed
// before it was ever run against real kernel data.
async function checkRetirementTripwireFor(seasonId, tokenId, accountId, label) {
  console.log(`Retirement tripwire (${label}): comparing anchored total to Hedera mirror-node balance...`);

  const deployBlock = Number(process.env.QUOTA_ANCHOR_DEPLOY_BLOCK);
  const events = await anchor.queryFilter(anchor.filters.UnitsRetired(seasonId), deployBlock);
  const anchoredTotal = events.reduce((sum, e) => sum + e.args.grams, 0n);

  const res = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}/balances?account.id=${accountId}`,
  );
  const data = await res.json();
  const actualBalance = BigInt(data.balances[0]?.balance ?? 0);

  console.log(`  anchored total retired: ${anchoredTotal}, actual mirror-node balance: ${actualBalance}`);

  if (actualBalance < anchoredTotal) {
    const shortfall = anchoredTotal - actualBalance;
    console.error(`RETIREMENT OUTFLOW DETECTED (${label}): shortfall of ${shortfall} grams.`);
    const tx = await anchor.recordRetirementOutflow(seasonId, shortfall, "unattributed");
    const receipt = await tx.wait();
    console.error("Anchored as RetirementOutflowDetected. Sepolia tx:", receipt.hash);
  } else {
    console.log("  no shortfall -- tripwire quiet this run.");
  }
}

async function checkRetirementTripwire() {
  await checkRetirementTripwireFor(SEASON_ID, hederaTokenId, retirementAccountId, "harvest");
  if (kernelTokenId && kernelRetirementAccountId) {
    await checkRetirementTripwireFor(KERNEL_SEASON_ID, kernelTokenId, kernelRetirementAccountId, "kernel");
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

// UnitsMinted gained a 5th field (lotRef) in v7. That changes the event's
// topic0 (keccak256 of its signature), so querying a pre-v7 deployment with
// v7's ABI silently returns ZERO logs for it -- not an error, just a topic
// that never matches anything actually emitted there. Every mint anchored
// on v1-v6 would then look "unmatched" again -- a third reconciler bug,
// this time from ABI drift across a signature-changing redeploy, not from
// reconciliation logic itself. Fixed by querying each deployment with the
// event shape IT actually emits, not whatever the current contract emits.
const OLD_UNITS_MINTED_ABI = ["event UnitsMinted(bytes32 indexed seasonId, address indexed to, uint256 grams, string hederaTxId)"];
const NEW_UNITS_MINTED_ABI = ["event UnitsMinted(bytes32 indexed seasonId, address indexed to, uint256 grams, string hederaTxId, string lotRef)"];

// Every QuotaAnchor address this project has ever deployed, each a fresh
// contract with its own empty event history. A reconciler that only checks
// the CURRENT address would misreport every mint anchored against an
// earlier (now-superseded) instance as unauthorized -- found exactly this
// way, empirically, not anticipated in advance. A production deployment
// without mid-build redeploys wouldn't need this list, but the lesson
// generalizes: "unauthorized" must mean "unanchored anywhere we've ever
// anchored," not "unanchored on whichever address I happened to check."
const ALL_ANCHOR_DEPLOYMENTS = [
  { address: "0x86b0A1F99D56830248622a3866457fA59442abdc", deployBlock: 11661523, abi: OLD_UNITS_MINTED_ABI }, // v1
  { address: "0xD844dF6A6A15ce24dB99b65A45311070506F8A9B", deployBlock: 11661839, abi: OLD_UNITS_MINTED_ABI }, // v2
  { address: "0xeA5dD3615e97b3Bfe67f3819F2c80Ce4FB8106c4", deployBlock: 11662146, abi: OLD_UNITS_MINTED_ABI }, // v3
  { address: "0xec7B4666c06dB283Cf5f58Bab7dEDFC522092832", deployBlock: 11662163, abi: OLD_UNITS_MINTED_ABI }, // v4
  { address: "0x717DF23aB2f875E81F2646141A45c2db82513977", deployBlock: 11662208, abi: OLD_UNITS_MINTED_ABI }, // v5
  { address: "0x39F0Fded796cB5323048a15b907CcE38979EDa2c", deployBlock: 11662229, abi: OLD_UNITS_MINTED_ABI }, // v6
  { address: process.env.QUOTA_ANCHOR_ADDRESS, deployBlock: Number(process.env.QUOTA_ANCHOR_DEPLOY_BLOCK), abi: NEW_UNITS_MINTED_ABI }, // v7, current
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

  const anchoredTxIds = new Set();
  for (const { address, deployBlock, abi } of ALL_ANCHOR_DEPLOYMENTS) {
    const c = new ethers.Contract(address, abi, provider);
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

async function doOpenSeason(seasonId, label, hederaTokenIdForSeason) {
  console.log(`Opening season "${label}" -- cap will be read from ENS by the contract itself, not supplied here...`);
  const node = ethers.namehash(`${label}.bronte.quota.eth`);

  const tx = await anchor.openSeason(
    seasonId,
    CONSORTIUM_ID,
    2026,
    process.env.ENS_BRONTE_REGISTRY_ADDRESS,
    label,
    process.env.ENS_RESOLVER_ADDRESS,
    node,
    hederaTokenIdForSeason,
  );
  const receipt = await tx.wait();
  console.log("SeasonOpened anchored. Sepolia tx:", receipt.hash);
}

// "Resolves the season name before every mint and refuses if it doesn't
// resolve or the role is absent" -- an off-chain courtesy check so a bad
// call never even reaches the contract, not a substitute for the contract's
// own on-chain enforcement (which re-checks both independently).
export async function checkSeasonAuthorization(label, certifier) {
  const resolverAddr = await bronteRegistry.getResolver(label);
  if (resolverAddr === ethers.ZeroAddress) {
    throw new Error(
      `REFUSED: "${label}.bronte.quota.eth" does not resolve (expired or unregistered). No transaction sent.`,
    );
  }

  const tokenId = await bronteRegistry.findTokenId(label);
  const hasMinterRole = await bronteRegistry.hasRoles(tokenId, MINTER_ROLE, certifier);
  if (!hasMinterRole) {
    throw new Error(
      `REFUSED: ${certifier} does not hold MINTER role for "${label}". No transaction sent.`,
    );
  }

  console.log(`  "${label}" resolves (resolver ${resolverAddr}) and ${certifier} holds MINTER. Proceeding.`);
}

export async function doMint(grams, lotRef, certifier) {
  console.log(`Checking season authorization for certifier ${certifier}...`);
  await checkSeasonAuthorization(SEASON_LABEL, certifier);

  console.log(`Minting ${grams} grams on Hedera (token ${hederaTokenId}, lot ${lotRef})...`);
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
  const hashscanUrl = `https://hashscan.io/testnet/transaction/${account}-${timestamp.replace(".", "-")}`;
  console.log("HashScan:", hashscanUrl);

  console.log("Anchoring on Sepolia...");
  try {
    const tx = await anchor.recordMint(SEASON_ID, wallet.address, grams, hederaTxId, certifier, lotRef);
    const receipt = await tx.wait();
    console.log("Anchored. Sepolia tx:", receipt.hash);
    console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${receipt.hash}`);
    return {
      hederaStatus: mintReceipt.status.toString(),
      hederaTxId,
      hashscanUrl,
      sepoliaTxHash: receipt.hash,
      etherscanUrl: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
    };
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

// Custody transfer, harvest token: operator (treasury) -> the deterministic
// processor account, ahead of transformation. Real Hedera transfer, then
// anchored -- same do-the-Hedera-leg-first pattern as everything else here.
export async function doTransfer(grams) {
  console.log(`Transferring ${grams} grams from operator to processor (${processorAccountId}) on Hedera...`);
  const transferSubmit = await new TransferTransaction()
    .addTokenTransfer(hederaTokenId, hederaOperatorId, -grams)
    .addTokenTransfer(hederaTokenId, AccountId.fromString(processorAccountId), grams)
    .execute(hederaClient);
  const transferReceipt = await transferSubmit.getReceipt(hederaClient);
  if (transferReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Hedera transfer failed: ${transferReceipt.status.toString()}`);
  }
  const hederaTxId = transferSubmit.transactionId.toString();
  console.log("Hedera transfer SUCCESS. Hedera tx ID:", hederaTxId);

  console.log("Anchoring transfer on Sepolia...");
  const tx = await anchor.recordTransfer(SEASON_ID, wallet.address, wallet.address, grams);
  const receipt = await tx.wait();
  console.log("UnitsTransferred anchored. Sepolia tx:", receipt.hash);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${receipt.hash}`);
  return { hederaTxId, sepoliaTxHash: receipt.hash };
}

// Live balance check, no local bookkeeping -- the source of truth for
// "does the processor have enough to transform" is the mirror node, not
// a counter this process maintains, since a fresh server restart (or a
// second caller) would desync a local counter immediately.
async function processorHarvestBalance() {
  const res = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/tokens/${hederaTokenId}/balances?account.id=${processorAccountId}`,
  );
  const data = await res.json();
  return BigInt(data.balances[0]?.balance ?? 0);
}

// The processor signs an outbound transfer of its own during a transform
// (input -> retirement), and the harvest token carries a 1 HBAR custom
// fee -- the processor pays that fee itself as sender, not the operator,
// even though the operator is the fee collector. The account was created
// with only 1 HBAR and has no ongoing income, so it silently drains to
// zero after enough real runs and the next transform fails with
// INSUFFICIENT_SENDER_ACCOUNT_BALANCE_FOR_CUSTOM_FEE -- found by actually
// running the demo panel end to end, not anticipated in the design. Tops
// up from the operator (1048 HBAR on testnet, effectively unlimited for
// this) whenever the processor's HBAR balance drops below a safety
// margin, so repeated demo takes don't require a manual top-up step.
const PROCESSOR_HBAR_MINIMUM = 3;
const PROCESSOR_HBAR_TOPUP = 5;

async function ensureProcessorHbar() {
  const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${processorAccountId}`);
  const data = await res.json();
  const balanceHbar = (data.balance?.balance ?? 0) / 1e8;
  if (balanceHbar >= PROCESSOR_HBAR_MINIMUM) return { topUpNeeded: false, balanceHbar };

  console.log(`Processor holds ${balanceHbar} HBAR, below the ${PROCESSOR_HBAR_MINIMUM} HBAR minimum -- topping up ${PROCESSOR_HBAR_TOPUP} HBAR from the operator...`);
  const topUpSubmit = await new TransferTransaction()
    .addHbarTransfer(hederaOperatorId, new Hbar(-PROCESSOR_HBAR_TOPUP))
    .addHbarTransfer(AccountId.fromString(processorAccountId), new Hbar(PROCESSOR_HBAR_TOPUP))
    .execute(hederaClient);
  const topUpReceipt = await topUpSubmit.getReceipt(hederaClient);
  if (topUpReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Processor HBAR top-up failed: ${topUpReceipt.status.toString()}`);
  }
  return { topUpNeeded: true, toppedUpHbar: PROCESSOR_HBAR_TOPUP };
}

// Ensures the processor holds at least `grams` of the harvest token before
// a transform's real Hedera leg runs, topping it up from the operator if
// not -- so the demo panel's "transform" button stays repeatable across
// takes without a separate manual funding step each time.
export async function ensureProcessorFunded(grams) {
  const balance = await processorHarvestBalance();
  if (balance >= BigInt(grams)) return { topUpNeeded: false, balance: balance.toString() };
  const shortfall = Number(BigInt(grams) - balance);
  console.log(`Processor holds ${balance}g, needs ${grams}g -- minting ${shortfall}g fresh and transferring it in...`);
  // Minted fresh (anchored) rather than moved from the operator's
  // pre-existing balance: a transfer alone would grow retiredGrams at
  // the next transform without growing mintedGrams to match, since
  // nothing anchors a new UnitsMinted for tokens that were already
  // sitting in the operator's balance before this run -- inCirculationGrams
  // (mintedGrams - retiredGrams) went visibly negative on the dashboard
  // from exactly this, caught by actually clicking the demo panel, not
  // anticipated in the design. Every top-up is now its own real,
  // anchored mint, so repeated demo takes stay balanced instead of
  // compounding a growing shortfall.
  const certifier = process.env.ENS_CERTIFIER_ADDRESS;
  await doMint(shortfall, `demo-topup-${Date.now()}`, certifier);
  await doTransfer(shortfall);
  return { topUpNeeded: true, toppedUp: shortfall.toString(), mintedFresh: true };
}

// Retirement is a real Hedera transfer to the dedicated retirement account
// (see CLAUDE.md, "Retire don't burn") followed by anchoring that same
// transfer's real transaction ID -- same pattern as doMint: do the Hedera
// leg first, anchor what actually happened, never anchor a claim the ledger
// doesn't back. The retirement account needs no private key here; only the
// sender (operator) signs a transfer.
async function doRetire(grams, lotRef) {
  console.log(`Transferring ${grams} grams to retirement account ${retirementAccountId} on Hedera...`);
  const transferSubmit = await new TransferTransaction()
    .addTokenTransfer(hederaTokenId, hederaOperatorId, -grams)
    .addTokenTransfer(hederaTokenId, retirementAccountId, grams)
    .execute(hederaClient);
  const transferReceipt = await transferSubmit.getReceipt(hederaClient);

  if (transferReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Hedera retirement transfer failed: ${transferReceipt.status.toString()}`);
  }

  const hederaTxId = transferSubmit.transactionId.toString();
  console.log("Hedera transfer SUCCESS.");
  console.log("Hedera tx ID:", hederaTxId);

  console.log("Anchoring retirement on Sepolia...");
  const tx = await anchor.recordRetirement(SEASON_ID, grams, lotRef, hederaTxId);
  const receipt = await tx.wait();
  console.log("UnitsRetired anchored. Sepolia tx:", receipt.hash);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${receipt.hash}`);
}

// Same as doRetire, for the OUTPUT product's own token and retirement
// account -- the final step of a lot's journey, closing the loop on the
// derived product the same way the harvest product closes.
async function doRetireKernel(grams, lotRef) {
  console.log(`Transferring ${grams} grams to kernel retirement account ${kernelRetirementAccountId} on Hedera...`);
  const transferSubmit = await new TransferTransaction()
    .addTokenTransfer(kernelTokenId, hederaOperatorId, -grams)
    .addTokenTransfer(kernelTokenId, kernelRetirementAccountId, grams)
    .execute(hederaClient);
  const transferReceipt = await transferSubmit.getReceipt(hederaClient);

  if (transferReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Hedera kernel retirement transfer failed: ${transferReceipt.status.toString()}`);
  }

  const hederaTxId = transferSubmit.transactionId.toString();
  console.log("Hedera transfer SUCCESS.");
  console.log("Hedera tx ID:", hederaTxId);

  console.log("Anchoring kernel retirement on Sepolia...");
  const tx = await anchor.recordRetirement(KERNEL_SEASON_ID, grams, lotRef, hederaTxId);
  const receipt = await tx.wait();
  console.log("UnitsRetired anchored. Sepolia tx:", receipt.hash);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${receipt.hash}`);
}

// The transformation itself. The ceiling check (recordTransform, which
// reads yieldBp live from ENS and reverts if outputGrams exceeds what that
// ratio permits) runs FIRST, on Sepolia, before any real Hedera token is
// moved -- so a bad claim fails cleanly with nothing to unwind. Only after
// that succeeds do the real Hedera legs run: input grams retired (processor
// -> retirement, signed with the deterministic processor key, NOT burned),
// output grams minted fresh on the kernel token, and both anchored.
export async function doTransform(inputGrams, outputGrams, lotRef, productType) {
  console.log(
    `Recording transform: ${inputGrams}g (lot ${lotRef}) -> claimed ${outputGrams}g ${productType}. Checking the yield ceiling on-chain first...`,
  );
  const transformTx = await anchor.recordTransform(
    SEASON_ID,
    inputGrams,
    KERNEL_SEASON_ID,
    outputGrams,
    productType,
    lotRef,
  );
  const transformReceipt = await transformTx.wait();
  console.log("Transformed anchored -- ceiling held. Sepolia tx:", transformReceipt.hash);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${transformReceipt.hash}`);

  // Ceiling held on Sepolia -- only now is it safe to touch real Hedera
  // balances. Top up the processor's token balance and its HBAR (it pays
  // the harvest token's custom fee itself when it signs the outbound
  // transfer below) first, if this call needs more of either than it
  // currently holds.
  await ensureProcessorFunded(inputGrams);
  await ensureProcessorHbar();

  console.log(`Retiring ${inputGrams}g of the input from the processor account (not burning)...`);
  const inputRetireSigned = await new TransferTransaction()
    .addTokenTransfer(hederaTokenId, AccountId.fromString(processorAccountId), -inputGrams)
    .addTokenTransfer(hederaTokenId, retirementAccountId, inputGrams)
    .freezeWith(hederaClient)
    .sign(processorKey);
  const inputRetireSubmit = await inputRetireSigned.execute(hederaClient);
  const inputRetireReceipt = await inputRetireSubmit.getReceipt(hederaClient);
  if (inputRetireReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Input retirement transfer failed: ${inputRetireReceipt.status.toString()}`);
  }
  const inputHederaTxId = inputRetireSubmit.transactionId.toString();
  console.log("Input retired on Hedera. Tx ID:", inputHederaTxId);

  console.log(`Minting ${outputGrams}g of ${productType} on Hedera (token ${kernelTokenId})...`);
  const outputMintSubmit = await new TokenMintTransaction()
    .setTokenId(kernelTokenId)
    .setAmount(outputGrams)
    .execute(hederaClient);
  const outputMintReceipt = await outputMintSubmit.getReceipt(hederaClient);
  if (outputMintReceipt.status.toString() !== "SUCCESS") {
    throw new Error(`Output mint failed: ${outputMintReceipt.status.toString()}`);
  }
  const outputHederaTxId = outputMintSubmit.transactionId.toString();
  console.log("Output minted on Hedera. Tx ID:", outputHederaTxId);

  console.log("Anchoring input retirement...");
  const retireTx = await anchor.recordRetirement(SEASON_ID, inputGrams, lotRef, inputHederaTxId);
  const retireReceipt = await retireTx.wait();
  console.log("UnitsRetired (input) anchored. Sepolia tx:", retireReceipt.hash);

  console.log("Anchoring output mint, through the same ENS-authorization path as any mint...");
  const certifier = process.env.ENS_CERTIFIER_ADDRESS;
  await checkSeasonAuthorization(KERNEL_SEASON_LABEL, certifier);
  const mintTx = await anchor.recordMint(KERNEL_SEASON_ID, wallet.address, outputGrams, outputHederaTxId, certifier, lotRef);
  const mintReceipt = await mintTx.wait();
  console.log("UnitsMinted (output) anchored. Sepolia tx:", mintReceipt.hash);

  return {
    transformTxHash: transformReceipt.hash,
    inputHederaTxId,
    outputHederaTxId,
    retireTxHash: retireReceipt.hash,
    mintTxHash: mintReceipt.hash,
  };
}

async function doRegisterParticipant(addr, role) {
  console.log(`Registering participant ${addr} (role: ${role})...`);
  const tx = await anchor.registerParticipant(CONSORTIUM_ID, addr, role);
  const receipt = await tx.wait();
  console.log("ParticipantRegistered anchored. Sepolia tx:", receipt.hash);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${receipt.hash}`);
}

// Guarded so `app/server` (and anything else) can import this module's
// functions -- doMint, doTransform, doTransfer, checkSeasonAuthorization,
// the season/consortium constants -- without triggering the CLI dispatch
// or closing the shared Hedera client out from under a long-running
// process. Only runs when this file is the one node was actually invoked
// on, i.e. `node relayer.mjs ...`, not `import "./relayer.mjs"`.
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
const [, , command, ...args] = process.argv;

try {
  await checkRetirementTripwire();

  if (command === "open-season") {
    await doOpenSeason(SEASON_ID, SEASON_LABEL, hederaTokenId);
  } else if (command === "open-kernel-season") {
    await doOpenSeason(KERNEL_SEASON_ID, KERNEL_SEASON_LABEL, kernelTokenId);
  } else if (command === "mint") {
    const grams = Number(args[0]);
    const lotRef = args[1];
    const certifier = args[2] || process.env.ENS_CERTIFIER_ADDRESS;
    if (!Number.isInteger(grams) || grams <= 0 || !lotRef) {
      throw new Error("Usage: node scripts/relayer.mjs mint <grams> <lotRef> [certifierAddress]");
    }
    await doMint(grams, lotRef, certifier);
  } else if (command === "reconcile-mints") {
    await reconcileMints();
  } else if (command === "transfer") {
    const grams = Number(args[0]);
    if (!Number.isInteger(grams) || grams <= 0) {
      throw new Error("Usage: node scripts/relayer.mjs transfer <grams>");
    }
    await doTransfer(grams);
  } else if (command === "transform") {
    const inputGrams = Number(args[0]);
    const outputGrams = Number(args[1]);
    const lotRef = args[2];
    const productType = args[3] || "kernel";
    if (!Number.isInteger(inputGrams) || inputGrams <= 0 || !Number.isInteger(outputGrams) || outputGrams <= 0 || !lotRef) {
      throw new Error("Usage: node scripts/relayer.mjs transform <inputGrams> <outputGrams> <lotRef> [productType=kernel]");
    }
    await doTransform(inputGrams, outputGrams, lotRef, productType);
  } else if (command === "retire") {
    const grams = Number(args[0]);
    const lotRef = args[1];
    if (!Number.isInteger(grams) || grams <= 0 || !lotRef) {
      throw new Error("Usage: node scripts/relayer.mjs retire <grams> <lotRef>");
    }
    await doRetire(grams, lotRef);
  } else if (command === "retire-kernel") {
    const grams = Number(args[0]);
    const lotRef = args[1];
    if (!Number.isInteger(grams) || grams <= 0 || !lotRef) {
      throw new Error("Usage: node scripts/relayer.mjs retire-kernel <grams> <lotRef>");
    }
    await doRetireKernel(grams, lotRef);
  } else if (command === "register-participant") {
    const addr = args[0];
    const role = args[1];
    if (!addr || !role) {
      throw new Error("Usage: node scripts/relayer.mjs register-participant <address> <role>");
    }
    await doRegisterParticipant(addr, role);
  } else {
    console.log(
      "Usage: node scripts/relayer.mjs <open-season|open-kernel-season|mint|transfer|transform|retire|retire-kernel|reconcile-mints|register-participant> [args]",
    );
    process.exitCode = 1;
  }
} finally {
  hederaClient.close();
}
}
