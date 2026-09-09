import { createHash } from "node:crypto";
import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  AccountCreateTransaction,
  TokenAssociateTransaction,
  TokenGrantKycTransaction,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.env.HEDERA_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// Same deterministic-key scheme as the retirement account (see CLAUDE.md,
// "Making retirement permanent"), reused here for a different role: this
// account holds harvest-token custody in transit -- it receives a transfer
// (harvest -> processor) and later signs an outbound transfer of its own
// (processor -> retirement, the input leg of a transformation). Publishing
// the derivation is the same trade as the retirement account: no
// cryptographic secrecy, but a reproducible, independently-checkable key
// rather than an unverifiable "we didn't keep it" claim.
const SEED_INPUT = `QUOTA-PROCESSOR-${tokenId}`;
const seedBytes = createHash("sha256").update(SEED_INPUT).digest();
const processorKey = PrivateKey.fromBytesED25519(seedBytes);

console.log("Derivation input:", SEED_INPUT);
console.log("Derived public key (DER):", processorKey.publicKey.toStringDer());

const createSubmit = await new AccountCreateTransaction()
  .setKey(processorKey.publicKey)
  .setInitialBalance(new Hbar(1))
  .execute(client);
const createReceipt = await createSubmit.getReceipt(client);
const processorAccountId = createReceipt.accountId;
console.log("Processor account created:", processorAccountId.toString());

const associateSigned = await new TokenAssociateTransaction()
  .setAccountId(processorAccountId)
  .setTokenIds([tokenId])
  .freezeWith(client)
  .sign(processorKey);
const associateSubmit = await associateSigned.execute(client);
const associateReceipt = await associateSubmit.getReceipt(client);
console.log("Associate status:", associateReceipt.status.toString());

const kycSubmit = await new TokenGrantKycTransaction()
  .setAccountId(processorAccountId)
  .setTokenId(tokenId)
  .execute(client);
const kycReceipt = await kycSubmit.getReceipt(client);
console.log("KYC grant status:", kycReceipt.status.toString());

client.close();
