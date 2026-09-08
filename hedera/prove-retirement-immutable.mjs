import { Client, PrivateKey, AccountId, TransferTransaction } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;
const retirementAccountId = AccountId.fromString(process.env.HEDERA_RETIREMENT_ACCOUNT_ID);
const retirementKey = PrivateKey.fromStringDer(process.env.HEDERA_RETIREMENT_ACCOUNT_KEY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

console.log("Attempting to move 1 gram OUT of the frozen retirement account (must fail)");

try {
  const tx = new TransferTransaction()
    .addTokenTransfer(tokenId, retirementAccountId, -1)
    .addTokenTransfer(tokenId, operatorId, 1)
    .freezeWith(client);
  const signed = await tx.sign(retirementKey);
  const submit = await signed.execute(client);
  const receipt = await submit.getReceipt(client);

  console.log("UNEXPECTED: transfer succeeded. Status:", receipt.status.toString());
} catch (err) {
  console.log("Transfer rejected, as expected.");
  console.log("Error type:", err.constructor.name);
  console.log("Status code:", err.status ? err.status.toString() : "(none on error object)");
  console.log("Error message:", err.message);
} finally {
  client.close();
}
