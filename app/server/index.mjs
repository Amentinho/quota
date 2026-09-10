// Local-only demo server for the dashboard's Demo tab. Holds the Sepolia
// relayer key and Hedera operator key in memory (via the imported relayer
// module) to sign real transactions on click, for the video recording.
// Binds to 127.0.0.1 only and is never deployed -- see README.md.
import express from "express";
import {
  doMint,
  doTransfer,
  doTransform,
  processorHarvestBalance,
  operatorHarvestBalance,
  bronteRegistry,
  SEASON_LABEL,
  hederaClient,
} from "../../scripts/relayer.mjs";
import { setMinterRole } from "../../ens/grant-minter.mjs";

const PORT = 4317;
const HOST = "127.0.0.1";

const app = express();
app.use(express.json());

// Manual CORS, not the `cors` package -- one extra dependency avoided for
// three response headers. Only ever reflects a localhost/127.0.0.1 origin;
// anything else gets no CORS headers at all, so a browser refuses the
// response regardless of what this server itself does.
app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Pulls every raw field an ethers/Hedera SDK error might carry. The
// credibility of this panel is the actual revert string or status code
// making it to the screen unparaphrased -- this exists so nothing gets
// summarized away between the chain and the browser.
function extractRaw(err) {
  const raw = { message: err.message };
  if (err.reason) raw.reason = err.reason;
  if (err.shortMessage) raw.shortMessage = err.shortMessage;
  if (err.code) raw.code = err.code;
  if (err.status) raw.hederaStatus = err.status.toString();
  if (err.data) raw.data = err.data;
  return raw;
}

function freshLotRef(prefix) {
  return `${prefix}-${Date.now()}`;
}

app.get("/health", (req, res) => res.json({ ok: true }));

// Public addresses/account IDs only, never a key -- lets the panel
// show/select real accounts without hardcoding them into DemoView.tsx
// (which would drift from .env the next time one rotates).
app.get("/config", (req, res) => {
  res.json({
    ok: true,
    headline: "Known role addresses and Hedera account IDs.",
    raw: {
      approverAddress: process.env.ENS_APPROVER_ADDRESS,
      issuer1Address: process.env.ENS_CERTIFIER_ADDRESS,
      issuer2Address: process.env.ENS_ISSUER_2_ADDRESS,
      treasuryAccountId: process.env.HEDERA_OPERATOR_ID,
      processorAccountId: process.env.HEDERA_PROCESSOR_ACCOUNT_ID,
    },
  });
});

app.post("/mint", async (req, res) => {
  const grams = Number(req.body?.grams) || 5;
  const lotRef = req.body?.lotRef || freshLotRef("demo-mint");
  const certifier = req.body?.certifier || process.env.ENS_CERTIFIER_ADDRESS;
  try {
    const result = await doMint(grams, lotRef, certifier);
    res.json({ ok: true, headline: `Minted ${grams}g and anchored on Sepolia.`, lotRef, raw: result });
  } catch (err) {
    res.json({ ok: false, headline: "Mint failed or was refused.", lotRef, raw: extractRaw(err) });
  }
});

// account is required, not defaulted to the certifier -- the Approver
// panel grants/revokes MINTER against whatever address the operator
// types into its editable field, which may be either issuer or any other
// address (including, deliberately, the Approver's own -- to show on
// screen that granting yourself MINTER is possible in principle but
// distinct from actually holding it until you do).
app.post("/revoke-minter", async (req, res) => {
  const account = req.body?.account;
  if (!account) {
    return res.status(400).json({ ok: false, headline: "account is required.", raw: { message: "missing account" } });
  }
  try {
    // Looked up live every call, not read from .env -- a resource's token
    // ID can shift (TokenRegenerated) and a stale cached value here would
    // silently revoke/grant against the wrong resource. See CLAUDE.md.
    const resource = await bronteRegistry.findTokenId(SEASON_LABEL);
    // Signed with the Approver's own key, not the relayer's -- the
    // Approver, not the infrastructure signer, is who actually holds
    // MINTER_ROLE_ADMIN post-rotation. See CLAUDE.md, "Three-level ENS
    // permission structure."
    const result = await setMinterRole(
      "revoke",
      process.env.ENS_BRONTE_REGISTRY_ADDRESS,
      resource.toString(),
      account,
      process.env.ENS_APPROVER_KEY,
    );
    if (result.noop) {
      return res.json({ ok: true, noop: true, headline: result.message, raw: result });
    }
    res.json({ ok: true, headline: `MINTER role revoked from ${account}.`, raw: result });
  } catch (err) {
    res.json({ ok: false, headline: "Revoke failed.", raw: extractRaw(err) });
  }
});

app.post("/grant-minter", async (req, res) => {
  const account = req.body?.account;
  if (!account) {
    return res.status(400).json({ ok: false, headline: "account is required.", raw: { message: "missing account" } });
  }
  try {
    const resource = await bronteRegistry.findTokenId(SEASON_LABEL);
    const result = await setMinterRole(
      "grant",
      process.env.ENS_BRONTE_REGISTRY_ADDRESS,
      resource.toString(),
      account,
      process.env.ENS_APPROVER_KEY,
    );
    if (result.noop) {
      return res.json({ ok: true, noop: true, headline: result.message, raw: result });
    }
    res.json({ ok: true, headline: `MINTER role granted to ${account}.`, raw: result });
  } catch (err) {
    res.json({ ok: false, headline: "Grant failed.", raw: extractRaw(err) });
  }
});

app.post("/transfer", async (req, res) => {
  const grams = Number(req.body?.grams);
  if (!grams || grams <= 0) {
    return res.status(400).json({ ok: false, headline: "grams is required.", raw: { message: "missing grams" } });
  }
  try {
    const result = await doTransfer(grams);
    res.json({ ok: true, headline: `Transferred ${grams}g from operator to processor.`, raw: result });
  } catch (err) {
    res.json({ ok: false, headline: "Transfer failed.", raw: extractRaw(err) });
  }
});

app.get("/processor-balance", async (req, res) => {
  try {
    const balance = await processorHarvestBalance();
    res.json({ ok: true, headline: `Processor holds ${balance}g of the harvest token.`, raw: { balance: balance.toString() } });
  } catch (err) {
    res.json({ ok: false, headline: "Could not read processor balance.", raw: extractRaw(err) });
  }
});

app.get("/operator-balance", async (req, res) => {
  try {
    const balance = await operatorHarvestBalance();
    res.json({ ok: true, headline: `Operator holds ${balance}g of the harvest token.`, raw: { balance: balance.toString() } });
  } catch (err) {
    res.json({ ok: false, headline: "Could not read operator balance.", raw: extractRaw(err) });
  }
});

app.post("/transform", async (req, res) => {
  const inputGrams = Number(req.body?.inputGrams) || 1000;
  const outputGrams = Number(req.body?.outputGrams);
  const lotRef = req.body?.lotRef || freshLotRef("demo-transform");
  const productType = req.body?.productType || "kernel";
  if (!outputGrams) {
    return res.status(400).json({ ok: false, headline: "outputGrams is required.", raw: { message: "missing outputGrams" } });
  }
  try {
    // No implicit funding here -- doTransform itself now refuses cleanly,
    // before touching Sepolia or Hedera, if the processor doesn't already
    // hold inputGrams. Funding the processor is the panel's own explicit
    // Mint + Transfer steps, not something this call resolves invisibly.
    const result = await doTransform(inputGrams, outputGrams, lotRef, productType);
    res.json({
      ok: true,
      headline: `Ceiling held: ${inputGrams}g -> ${outputGrams}g anchored, input retired, output minted.`,
      lotRef,
      raw: result,
    });
  } catch (err) {
    res.json({
      ok: false,
      headline: "Reverted or refused -- no Hedera token was touched.",
      lotRef,
      raw: extractRaw(err),
    });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`QUOTA demo server listening on http://${HOST}:${PORT} (localhost only, never deployed)`);
  console.log("Endpoints: GET /config, /processor-balance, /operator-balance, POST /mint, /revoke-minter, /grant-minter, /transfer, /transform");
});

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close();
  hederaClient.close();
  process.exit(0);
});
