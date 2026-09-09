# contracts

Hardhat 3 project. `QuotaAnchor.sol` — the Sepolia authorization-record contract (Layer 2). Deployed and verified, current address: [`0x13A0Bb73C5a629dF1a8c91F99213d6077cc1acE2`](https://sepolia.etherscan.io/address/0x13A0Bb73C5a629dF1a8c91F99213d6077cc1acE2#code) (`QUOTA_ANCHOR_ADDRESS` in `.env`, v7 — this is what the subgraph and every other live link in this repo point at). Reads the season cap live from an ENS resolver and checks a `MINTER` EAC role before anchoring a mint — see CLAUDE.md. Six prior addresses are superseded, not deleted — full history and the reasons for each redeploy are in `CLAUDE.md`'s Status section, kept in `.env` as `QUOTA_ANCHOR_ADDRESS_V{1-6}_DEPRECATED` because the subgraph's mint reconciler needs every address to check history against. Don't link a deprecated address as if it were current — two of them hold immutable false-positive detector events from early reconciler bugs.

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
