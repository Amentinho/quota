// Local-only demo server for the dashboard's Demo tab. Holds the Sepolia
// relayer key and Hedera operator key in memory (via the imported relayer
// module) to sign real transactions on click, for the video recording.
// Binds to 127.0.0.1 only and is never deployed -- see README.md.
import express from "express";
import { doMint, doTransform, bronteRegistry, SEASON_LABEL, hederaClient } from "../../scripts/relayer.mjs";
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

app.post("/revoke-minter", async (req, res) => {
  try {
    // Looked up live every call, not read from .env -- a resource's token
    // ID can shift (TokenRegenerated) and a stale cached value here would
    // silently revoke/grant against the wrong resource. See CLAUDE.md.
    const resource = await bronteRegistry.findTokenId(SEASON_LABEL);
    const account = process.env.ENS_CERTIFIER_ADDRESS;
    const result = await setMinterRole("revoke", process.env.ENS_BRONTE_REGISTRY_ADDRESS, resource.toString(), account);
    res.json({ ok: true, headline: "MINTER role revoked from the certifier.", raw: result });
  } catch (err) {
    res.json({ ok: false, headline: "Revoke failed.", raw: extractRaw(err) });
  }
});

app.post("/grant-minter", async (req, res) => {
  try {
    const resource = await bronteRegistry.findTokenId(SEASON_LABEL);
    const account = process.env.ENS_CERTIFIER_ADDRESS;
    const result = await setMinterRole("grant", process.env.ENS_BRONTE_REGISTRY_ADDRESS, resource.toString(), account);
    res.json({ ok: true, headline: "MINTER role restored to the certifier.", raw: result });
  } catch (err) {
    res.json({ ok: false, headline: "Grant failed.", raw: extractRaw(err) });
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
    // The panel's own "topping up" happens inside doTransform via
    // ensureProcessorFunded, so a retake never needs a manual prep step --
    // but funding only ever runs after the Sepolia ceiling check has
    // already passed, so a rejected claim never touches Hedera at all.
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
      headline: "Reverted -- no Hedera token was touched.",
      lotRef,
      raw: extractRaw(err),
    });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`QUOTA demo server listening on http://${HOST}:${PORT} (localhost only, never deployed)`);
  console.log("Endpoints: POST /mint, /revoke-minter, /grant-minter, /transform");
});

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close();
  hederaClient.close();
  process.exit(0);
});
