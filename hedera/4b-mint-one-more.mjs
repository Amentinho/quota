import { Client, PrivateKey, AccountId, TokenMintTransaction } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

console.log("4b — mint 1 gram beyond cap (must fail)");

try {
  const tx = new TokenMintTransaction().setTokenId(tokenId).setAmount(1);
  const submit = await tx.execute(client);
  const receipt = await submit.getReceipt(client);

  console.log("UNEXPECTED: mint succeeded. Status:", receipt.status.toString());
  console.log("New total supply (grams):", receipt.totalSupply?.toString());
} catch (err) {
  console.log("Mint rejected, as expected.");
  console.log("Error type:", err.constructor.name);
  console.log("Status code:", err.status ? err.status.toString() : "(none on error object)");
  console.log("Error message:", err.message);
} finally {
  client.close();
}
