import { Client, PrivateKey, AccountId, TokenMintTransaction } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const CAP_GRAMS = 3_400_000_000;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

try {
  const tx = new TokenMintTransaction().setTokenId(tokenId).setAmount(CAP_GRAMS);
  const submit = await tx.execute(client);
  const receipt = await submit.getReceipt(client);

  console.log("4a — mint to cap");
  console.log("Status:", receipt.status.toString());
  console.log("Minted (grams):", CAP_GRAMS);
  console.log("New total supply (grams):", receipt.totalSupply?.toString());
  console.log("Equals cap?", receipt.totalSupply?.toString() === String(CAP_GRAMS));
} finally {
  client.close();
}
