import {
  Client,
  PrivateKey,
  AccountId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// The derived-product token for the transformation flow: pistachio kernel,
// yielded from the harvest token at the ratio declared on ENS
// (quota.yield.kernel.bp = 4500), so maxSupply here is that ratio applied
// to the harvest cap (3,400,000,000 * 0.45 = 1,530,000,000) -- the same
// "cap enforced by Hedera consensus, not our code" property as the harvest
// token, just for the derived product. No custom fee here (unlike the
// harvest token's consortium levy) -- not part of what this token exists to
// demonstrate, and skipping it keeps this script to the one property that
// matters: a second FINITE-supply, admin-less token for the output leg of
// a real transformation.
const tx = new TokenCreateTransaction()
  .setTokenName("QUOTA Bronte PDO Pistachio Kernel 2026")
  .setTokenSymbol("QBRK26")
  .setTokenType(TokenType.FungibleCommon)
  .setDecimals(3)
  .setInitialSupply(0)
  .setSupplyType(TokenSupplyType.Finite)
  .setMaxSupply(1_530_000_000)
  .setTreasuryAccountId(operatorId)
  .setSupplyKey(operatorKey)
  .setKycKey(operatorKey)
  .setFreezeKey(operatorKey);
  // No adminKey, wipeKey, pauseKey, or feeScheduleKey -- immutable, same as
  // the harvest token.

const submit = await tx.execute(client);
const receipt = await submit.getReceipt(client);

console.log("Kernel token ID:", receipt.tokenId.toString());
console.log("Status:", receipt.status.toString());

client.close();
