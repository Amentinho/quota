import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  KeyList,
  AccountCreateTransaction,
  AccountUpdateTransaction,
  TokenAssociateTransaction,
  TokenGrantKycTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

console.log("Does Hedera allow rekeying an ALREADY-associated account to an unsatisfiable key?");
console.log("(Account creation rejects unsatisfiable keys outright — does AccountUpdateTransaction too?)\n");

const initialKey = PrivateKey.generateED25519();

const createSubmit = await new AccountCreateTransaction()
  .setKey(initialKey.publicKey)
  .setInitialBalance(new Hbar(1))
  .execute(client);
const createReceipt = await createSubmit.getReceipt(client);
const accountId = createReceipt.accountId;
console.log("Account created (normal key):", accountId.toString());

const associateSigned = await new TokenAssociateTransaction()
  .setAccountId(accountId)
  .setTokenIds([tokenId])
  .freezeWith(client)
  .sign(initialKey);
const associateSubmit = await associateSigned.execute(client);
const associateReceipt = await associateSubmit.getReceipt(client);
console.log("Associate status:", associateReceipt.status.toString());

const kycSubmit = await new TokenGrantKycTransaction()
  .setAccountId(accountId)
  .setTokenId(tokenId)
  .execute(client);
const kycReceipt = await kycSubmit.getReceipt(client);
console.log("KYC grant status:", kycReceipt.status.toString());

const inSubmit = await new TransferTransaction()
  .addTokenTransfer(tokenId, operatorId, -1)
  .addTokenTransfer(tokenId, accountId, 1)
  .execute(client);
const inReceipt = await inSubmit.getReceipt(client);
console.log("Inbound transfer (1 gram) status:", inReceipt.status.toString());

console.log("\n--- Attempting to rekey to an empty KeyList (0 members) ---");
try {
  const updateSigned = await new AccountUpdateTransaction()
    .setAccountId(accountId)
    .setKey(new KeyList())
    .freezeWith(client)
    .sign(initialKey);
  const updateSubmit = await updateSigned.execute(client);
  const updateReceipt = await updateSubmit.getReceipt(client);
  console.log("Rekey SUCCEEDED. Status:", updateReceipt.status.toString());
} catch (err) {
  console.log("Rekey rejected.");
  console.log("Status code:", err.status ? err.status.toString() : "(none)");
  console.log("Message:", err.message);
}

console.log("\n--- Attempting to rekey to an impossible 2-of-1 threshold ---");
const soleKey = PrivateKey.generateED25519();
const impossibleKey = new KeyList([soleKey.publicKey]).setThreshold(2);
let rekeySucceeded = false;
try {
  const updateSigned = await new AccountUpdateTransaction()
    .setAccountId(accountId)
    .setKey(impossibleKey)
    .freezeWith(client)
    .sign(initialKey);
  const updateSignedTwice = await updateSigned.sign(soleKey);
  const updateSubmit = await updateSignedTwice.execute(client);
  const updateReceipt = await updateSubmit.getReceipt(client);
  console.log("Rekey SUCCEEDED. Status:", updateReceipt.status.toString());
  rekeySucceeded = true;
} catch (err) {
  console.log("Rekey rejected.");
  console.log("Status code:", err.status ? err.status.toString() : "(none)");
  console.log("Message:", err.message);
}

if (rekeySucceeded) {
  console.log("\n--- Account rekeyed. Attempting outbound transfer with the ONLY real key in the impossible threshold ---");
  try {
    const outSigned = await new TransferTransaction()
      .addTokenTransfer(tokenId, accountId, -1)
      .addTokenTransfer(tokenId, operatorId, 1)
      .freezeWith(client)
      .sign(soleKey);
    const outSubmit = await outSigned.execute(client);
    const outReceipt = await outSubmit.getReceipt(client);
    console.log("UNEXPECTED: outbound transfer succeeded. Status:", outReceipt.status.toString());
  } catch (err) {
    console.log("Outbound transfer rejected, even signed by the one real key in the 2-of-1 threshold.");
    console.log("Status code:", err.status ? err.status.toString() : "(none)");
    console.log("Message:", err.message);
  }
  console.log("\nAccount ID for reference:", accountId.toString());
}

client.close();
