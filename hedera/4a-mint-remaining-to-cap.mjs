import { Client, PrivateKey, AccountId, TokenMintTransaction, TokenInfoQuery } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// 4a-mint-to-cap.mjs mints a hardcoded 3,400,000,000 -- correct only for a
// freshly-created token at zero supply. Every demo/build session since has
// left real grams minted, so "mint to cap" now means "mint whatever
// headroom is actually left", not a fixed historical number. Reads live
// supply first so this stays correct on any future retake, not just today.
const info = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
const currentSupply = info.totalSupply.toNumber();
const maxSupply = info.maxSupply.toNumber();
const headroom = maxSupply - currentSupply;

console.log("4a — mint remaining headroom to cap");
console.log("Current total supply (grams):", currentSupply);
console.log("Max supply (grams):", maxSupply);
console.log("Headroom (grams):", headroom);

if (headroom <= 0) {
  console.log("Already at cap -- nothing to mint. Run hedera/4b-mint-one-more.mjs directly to show the rejection.");
  client.close();
  process.exit(0);
}

try {
  const tx = new TokenMintTransaction().setTokenId(tokenId).setAmount(headroom);
  const submit = await tx.execute(client);
  const receipt = await submit.getReceipt(client);

  console.log("Status:", receipt.status.toString());
  console.log("Minted (grams):", headroom);
  console.log("New total supply (grams):", receipt.totalSupply?.toString());
  console.log("Equals cap?", receipt.totalSupply?.toString() === String(maxSupply));
} finally {
  client.close();
}
