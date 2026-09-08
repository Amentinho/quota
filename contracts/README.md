# contracts

Hardhat 3 project. `QuotaAnchor.sol` — the Sepolia authorization-record contract (Layer 2). Deployed and verified: [`0x86b0A1F99D56830248622a3866457fA59442abdc`](https://sepolia.etherscan.io/address/0x86b0A1F99D56830248622a3866457fA59442abdc#code).

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
