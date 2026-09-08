import { Client, PrivateKey, AccountId, TokenMintTransaction } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

console.log("Minting directly via Hedera SDK, bypassing the relayer/anchor entirely...");
const submit = await new TokenMintTransaction().setTokenId(tokenId).setAmount(1).execute(client);
const receipt = await submit.getReceipt(client);
console.log("Status:", receipt.status.toString());
console.log("Hedera tx ID:", submit.transactionId.toString());
console.log("No Sepolia anchor was written for this mint -- that's the point.");

client.close();
