import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  KeyList,
  AccountCreateTransaction,
  TokenGrantKycTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

async function tryCreate(label, key) {
  console.log(`\n--- ${label} ---`);
  try {
    const submit = await new AccountCreateTransaction()
      .setKey(key)
      .setInitialBalance(new Hbar(1))
      .setMaxAutomaticTokenAssociations(1) // so it can receive without ever signing an associate tx
      .execute(client);
    const receipt = await submit.getReceipt(client);
    console.log("Account creation status:", receipt.status.toString());
    console.log("Account ID:", receipt.accountId?.toString());
    return receipt.accountId ?? null;
  } catch (err) {
    console.log("Account creation FAILED.");
    console.log("Error type:", err.constructor.name);
    console.log("Status code:", err.status ? err.status.toString() : "(none)");
    console.log("Message:", err.message);
    return null;
  }
}

console.log("=== Option 1a: empty KeyList ===");
await tryCreate("Empty KeyList (zero members)", new KeyList());

console.log("\n=== Option 1b: impossible threshold (2-of-1) ===");
const soleKey = PrivateKey.generateED25519();
const impossibleKey = new KeyList([soleKey.publicKey]).setThreshold(2);
const candidateAccountId = await tryCreate(
  "KeyList with 1 real member, threshold set to 2",
  impossibleKey,
);

if (candidateAccountId) {
  console.log(`\n--- Testing candidate account ${candidateAccountId.toString()} ---`);

  const kycSubmit = await new TokenGrantKycTransaction()
    .setAccountId(candidateAccountId)
    .setTokenId(tokenId)
    .execute(client);
  const kycReceipt = await kycSubmit.getReceipt(client);
  console.log("KYC grant status:", kycReceipt.status.toString());

  try {
    const inSubmit = await new TransferTransaction()
      .addTokenTransfer(tokenId, operatorId, -1)
      .addTokenTransfer(tokenId, candidateAccountId, 1)
      .execute(client);
    const inReceipt = await inSubmit.getReceipt(client);
    console.log("Inbound transfer (1 gram, auto-associate) status:", inReceipt.status.toString());
  } catch (err) {
    console.log("Inbound transfer FAILED.");
    console.log("Status code:", err.status ? err.status.toString() : "(none)");
    console.log("Message:", err.message);
  }

  try {
    const outTx = new TransferTransaction()
      .addTokenTransfer(tokenId, candidateAccountId, -1)
      .addTokenTransfer(tokenId, operatorId, 1)
      .freezeWith(client);
    const outSigned = await outTx.sign(soleKey); // the ONE real key in the impossible KeyList
    const outSubmit = await outSigned.execute(client);
    const outReceipt = await outSubmit.getReceipt(client);
    console.log("UNEXPECTED: outbound transfer succeeded. Status:", outReceipt.status.toString());
  } catch (err) {
    console.log(
      "Outbound transfer rejected, even signed by the one real key in the 2-of-1 threshold.",
    );
    console.log("Error type:", err.constructor.name);
    console.log("Status code:", err.status ? err.status.toString() : "(none)");
    console.log("Message:", err.message);
  }
} else {
  console.log("\nNo candidate account survived creation — option 1 fails outright.");
}

client.close();
