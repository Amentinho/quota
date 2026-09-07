import {
  Client,
  PrivateKey,
  AccountId,
  Hbar,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  CustomFixedFee,
} from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

// Day 1: one key (the operator's) plays supplyKey/kycKey/freezeKey. A real
// consortium deployment would split these so a certifier can hold a scoped
// minting role without also controlling freeze/KYC.
const consortiumLevy = new CustomFixedFee()
  .setHbarAmount(new Hbar(1))
  .setFeeCollectorAccountId(operatorId)
  .setAllCollectorsAreExempt(true);

const tx = new TokenCreateTransaction()
  .setTokenName("QUOTA Bronte PDO Pistachio 2026")
  .setTokenSymbol("QBRP26")
  .setTokenType(TokenType.FungibleCommon)
  .setDecimals(3)
  .setInitialSupply(0)
  .setSupplyType(TokenSupplyType.Finite)
  .setMaxSupply(3_400_000_000)
  .setTreasuryAccountId(operatorId)
  .setSupplyKey(operatorKey)
  .setKycKey(operatorKey)
  .setFreezeKey(operatorKey)
  .setCustomFees([consortiumLevy]);
  // No adminKey, wipeKey, pauseKey, or feeScheduleKey: the token and its
  // 1 HBAR transfer levy are both immutable from the moment this executes.

const submit = await tx.execute(client);
const receipt = await submit.getReceipt(client);

console.log("Token ID:", receipt.tokenId.toString());
console.log("Status:", receipt.status.toString());

client.close();
