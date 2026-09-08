import { Client, PrivateKey, AccountId, TransferTransaction, TokenInfoQuery } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;
const retirementAccountId = process.env.HEDERA_RETIREMENT_ACCOUNT_ID;

const amount = Number(process.argv[2]);
if (!Number.isInteger(amount) || amount <= 0) {
  throw new Error("Usage: node hedera/retire.mjs <grams>");
}

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

try {
  const before = await new TokenInfoQuery().setTokenId(tokenId).execute(client);

  const submit = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorId, -amount)
    .addTokenTransfer(tokenId, retirementAccountId, amount)
    .execute(client);
  const receipt = await submit.getReceipt(client);

  const after = await new TokenInfoQuery().setTokenId(tokenId).execute(client);

  console.log("Retire (transfer treasury -> retirement account)");
  console.log("Amount (grams):", amount);
  console.log("Transfer status:", receipt.status.toString());
  console.log("Total supply before:", before.totalSupply.toString());
  console.log("Total supply after: ", after.totalSupply.toString());
  console.log(
    "Total supply unchanged?",
    before.totalSupply.toString() === after.totalSupply.toString(),
  );
} finally {
  client.close();
}
