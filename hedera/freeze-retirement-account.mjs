import { Client, PrivateKey, AccountId, TokenFreezeTransaction } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;
const retirementAccountId = process.env.HEDERA_RETIREMENT_ACCOUNT_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

try {
  const submit = await new TokenFreezeTransaction()
    .setAccountId(retirementAccountId)
    .setTokenId(tokenId)
    .execute(client);
  const receipt = await submit.getReceipt(client);

  console.log("Freeze retirement account", retirementAccountId, "on token", tokenId);
  console.log("Status:", receipt.status.toString());
} finally {
  client.close();
}
