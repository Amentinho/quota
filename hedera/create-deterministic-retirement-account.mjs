import { createHash } from "node:crypto";
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

// The retirement account's key is PUBLIC BY DESIGN: anyone can reproduce it
// from this exact formula (see README, "Making retirement permanent"), so
// it provides no cryptographic protection. That's the intended trade — a
// verifiable, worthless-as-a-control key instead of an unverifiable claim
// that a real key was discarded.
const SEED_INPUT = `QUOTA-RETIREMENT-${tokenId}`;
const seedBytes = createHash("sha256").update(SEED_INPUT).digest();
const retirementKey = PrivateKey.fromBytesED25519(seedBytes);

console.log("Derivation input:", SEED_INPUT);
console.log("Derived public key (DER):", retirementKey.publicKey.toStringDer());

const createSubmit = await new AccountCreateTransaction()
  .setKey(retirementKey.publicKey)
  .setInitialBalance(new Hbar(1))
  .execute(client);
const createReceipt = await createSubmit.getReceipt(client);
const retirementAccountId = createReceipt.accountId;
console.log("Retirement account created:", retirementAccountId.toString());

const associateSigned = await new TokenAssociateTransaction()
  .setAccountId(retirementAccountId)
  .setTokenIds([tokenId])
  .freezeWith(client)
  .sign(retirementKey);
const associateSubmit = await associateSigned.execute(client);
const associateReceipt = await associateSubmit.getReceipt(client);
console.log("Associate status:", associateReceipt.status.toString());

const kycSubmit = await new TokenGrantKycTransaction()
  .setAccountId(retirementAccountId)
  .setTokenId(tokenId)
  .execute(client);
const kycReceipt = await kycSubmit.getReceipt(client);
console.log("KYC grant status:", kycReceipt.status.toString());

const RETIRE_AMOUNT = 25_000;
const retireSubmit = await new TransferTransaction()
  .addTokenTransfer(tokenId, operatorId, -RETIRE_AMOUNT)
  .addTokenTransfer(tokenId, retirementAccountId, RETIRE_AMOUNT)
  .execute(client);
const retireReceipt = await retireSubmit.getReceipt(client);
console.log(`Retired ${RETIRE_AMOUNT} grams. Status:`, retireReceipt.status.toString());

console.log(
  "\nProving the key is genuinely spendable — the acknowledged security property, demonstrated rather than just claimed:",
);
const outSigned = await new TransferTransaction()
  .addTokenTransfer(tokenId, retirementAccountId, -1)
  .addTokenTransfer(tokenId, operatorId, 1)
  .freezeWith(client)
  .sign(retirementKey);
const outSubmit = await outSigned.execute(client);
const outReceipt = await outSubmit.getReceipt(client);
console.log("Outbound transfer of 1 gram, signed with the reproduced key. Status:", outReceipt.status.toString());

console.log("\nMoving that 1 gram back in, to leave the retired total clean:");
const backSubmit = await new TransferTransaction()
  .addTokenTransfer(tokenId, operatorId, -1)
  .addTokenTransfer(tokenId, retirementAccountId, 1)
  .execute(client);
const backReceipt = await backSubmit.getReceipt(client);
console.log("Status:", backReceipt.status.toString());

client.close();
