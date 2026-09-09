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
const kernelTokenId = process.env.HEDERA_KERNEL_TOKEN_ID;

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// Same formula as the harvest token's retirement account (see CLAUDE.md,
// "Making retirement permanent"), parameterized by this token's own ID --
// exactly the "a new season's token produces a different, independently
// reproducible account" property that was already designed in, now used
// for real with a second token. The reversibility/publicness proof for
// this exact scheme was already run once for the harvest token; not
// repeated here since it would just be the same proof against a second
// account of the identical construction.
const SEED_INPUT = `QUOTA-RETIREMENT-${kernelTokenId}`;
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
console.log("Kernel retirement account created:", retirementAccountId.toString());

const associateSigned = await new TokenAssociateTransaction()
  .setAccountId(retirementAccountId)
  .setTokenIds([kernelTokenId])
  .freezeWith(client)
  .sign(retirementKey);
const associateSubmit = await associateSigned.execute(client);
const associateReceipt = await associateSubmit.getReceipt(client);
console.log("Associate status:", associateReceipt.status.toString());

const kycSubmit = await new TokenGrantKycTransaction()
  .setAccountId(retirementAccountId)
  .setTokenId(kernelTokenId)
  .execute(client);
const kycReceipt = await kycSubmit.getReceipt(client);
console.log("KYC grant status:", kycReceipt.status.toString());

client.close();
