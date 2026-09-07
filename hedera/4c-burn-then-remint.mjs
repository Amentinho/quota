import {
  Client,
  PrivateKey,
  AccountId,
  TokenBurnTransaction,
  TokenMintTransaction,
  TokenInfoQuery,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const BURN_GRAMS = 100_000;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

console.log("4c — burn then attempt to re-mint (the result that decides retire-vs-burn)");

try {
  const before = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
  console.log("Total supply before burn (grams):", before.totalSupply.toString());

  const burnTx = new TokenBurnTransaction().setTokenId(tokenId).setAmount(BURN_GRAMS);
  const burnSubmit = await burnTx.execute(client);
  const burnReceipt = await burnSubmit.getReceipt(client);
  console.log("Burn status:", burnReceipt.status.toString());
  console.log("Total supply after burn (grams):", burnReceipt.totalSupply?.toString());

  try {
    const mintTx = new TokenMintTransaction().setTokenId(tokenId).setAmount(1);
    const mintSubmit = await mintTx.execute(client);
    const mintReceipt = await mintSubmit.getReceipt(client);

    console.log("RESULT: mint of 1 gram after burn SUCCEEDED.");
    console.log("Status:", mintReceipt.status.toString());
    console.log("New total supply (grams):", mintReceipt.totalSupply?.toString());
    console.log("=> Burning DID reopen mint headroom. Confirms retire-don't-burn design.");
  } catch (err) {
    console.log("RESULT: mint of 1 gram after burn FAILED.");
    console.log("Status code:", err.status ? err.status.toString() : "(none on error object)");
    console.log("Error message:", err.message);
    console.log("=> Burning did NOT reopen mint headroom.");
  }
} finally {
  client.close();
}
