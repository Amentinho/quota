import { appendFileSync } from "node:fs";
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

// The retirement account gets its own key (not the operator's) because in a
// real deployment it must be able to sign its own association — the
// consortium doesn't have to be the one running this script.
const retirementKey = PrivateKey.generateED25519();

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

appendFileSync(
  new URL("../.env", import.meta.url),
  `HEDERA_RETIREMENT_ACCOUNT_ID=${retirementAccountId.toString()}\nHEDERA_RETIREMENT_ACCOUNT_KEY=${retirementKey.toStringDer()}\n`,
);
console.log("Retirement account ID and key written to .env");

client.close();
