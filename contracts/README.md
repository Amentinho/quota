# contracts

Hardhat 3 project. `QuotaAnchor.sol` — the Sepolia authorization-record contract (Layer 2). Deployed and verified: [`0xD844dF6A6A15ce24dB99b65A45311070506F8A9B`](https://sepolia.etherscan.io/address/0xD844dF6A6A15ce24dB99b65A45311070506F8A9B#code). Reads the season cap live from an ENS resolver and checks a `MINTER` EAC role before anchoring a mint — see CLAUDE.md. Prior address `0x86b0A1F99D56830248622a3866457fA59442abdc` (before the ENS read) is superseded, not deleted — see `.env`'s `QUOTA_ANCHOR_ADDRESS_V1_DEPRECATED`.

```
npx hardhat compile
```

Deployment (already done for the current address — rerun only to redeploy):

```
node --env-file=../.env deploy.mjs
```

Verification (Etherscan, Blockscout, and Sourcify in one run):

```
npx hardhat verify --network sepolia <address> <relayer-address>
```
