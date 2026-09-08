import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  AccountCreateTransaction,
  TokenAssociateTransaction,
  TokenGrantKycTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// Generate a keypair and use it exactly once: to sign the token
// association this account needs before it can be KYC-approved.
// Hedera requires an account's own signature for TokenAssociateTransaction
// with no exception — an attempt to skip this via maxAutomaticTokenAssociations
// and rely on auto-association during the first transfer fails on this
// token specifically, because ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN blocks the
// transfer before association can occur (see hedera/README.md). After this
// one signature, the key is set to null and never referenced again — never
// written to .env, any file, or printed below. This is a trust claim that
// we discarded it, not a cryptographic proof the way option 1 would have
// been if it had worked.
let ephemeralKey = PrivateKey.generateED25519();

const createSubmit = await new AccountCreateTransaction()
  .setKey(ephemeralKey.publicKey)
  .setInitialBalance(new Hbar(1))
  .execute(client);
const createReceipt = await createSubmit.getReceipt(client);
const retirementAccountId = createReceipt.accountId;
console.log("Discarded-key retirement account created:", retirementAccountId.toString());

const associateSigned = await new TokenAssociateTransaction()
  .setAccountId(retirementAccountId)
  .setTokenIds([tokenId])
  .freezeWith(client)
  .sign(ephemeralKey);
const associateSubmit = await associateSigned.execute(client);
const associateReceipt = await associateSubmit.getReceipt(client);
console.log("Associate status:", associateReceipt.status.toString());

ephemeralKey = null; // the only reference to the only copy that ever existed

const kycSubmit = await new TokenGrantKycTransaction()
  .setAccountId(retirementAccountId)
  .setTokenId(tokenId)
  .execute(client);
const kycReceipt = await kycSubmit.getReceipt(client);
console.log("KYC grant status:", kycReceipt.status.toString());

const inSubmit = await new TransferTransaction()
  .addTokenTransfer(tokenId, operatorId, -1)
  .addTokenTransfer(tokenId, retirementAccountId, 1)
  .execute(client);
const inReceipt = await inSubmit.getReceipt(client);
console.log("Inbound transfer (1 gram) status:", inReceipt.status.toString());

console.log(
  "\nAttempting an outbound transfer with no signature for this account (none exists to provide):",
);
try {
  const outSubmit = await new TransferTransaction()
    .addTokenTransfer(tokenId, retirementAccountId, -1)
    .addTokenTransfer(tokenId, operatorId, 1)
    .execute(client);
  const outReceipt = await outSubmit.getReceipt(client);
  console.log("UNEXPECTED: outbound transfer succeeded. Status:", outReceipt.status.toString());
} catch (err) {
  console.log("Outbound transfer rejected.");
  console.log("Error type:", err.constructor.name);
  console.log("Status code:", err.status ? err.status.toString() : "(none)");
  console.log("Message:", err.message);
}

client.close();
