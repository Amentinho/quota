import { Client, PrivateKey, AccountId, TokenInfoQuery } from "@hashgraph/sdk";

const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY);
const tokenId = process.argv[2];

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

const info = await new TokenInfoQuery().setTokenId(tokenId).execute(client);

console.log(JSON.stringify({
  tokenId: info.tokenId.toString(),
  name: info.name,
  symbol: info.symbol,
  decimals: info.decimals,
  maxSupply: info.maxSupply?.toString(),
  totalSupply: info.totalSupply?.toString(),
  supplyType: info.supplyType?.toString(),
  supplyKey: !!info.supplyKey,
  kycKey: !!info.kycKey,
  freezeKey: !!info.freezeKey,
  adminKey: !!info.adminKey,
  wipeKey: !!info.wipeKey,
  pauseKey: !!info.pauseKey,
  feeScheduleKey: !!info.feeScheduleKey,
  customFees: info.customFees?.map(f => ({
    type: f.constructor.name,
    amount: f.amount?.toString(),
    collector: f.feeCollectorAccountId?.toString(),
    allCollectorsAreExempt: f.allCollectorsAreExempt,
  })),
}, null, 2));

client.close();
