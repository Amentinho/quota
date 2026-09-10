# app/server

A local-only Express server backing the dashboard's **Demo** tab, built for the video recording. It imports the real relayer functions (`scripts/relayer.mjs`, `ens/grant-minter.mjs`) and holds the Sepolia relayer key, the Sepolia Approver key, and the Hedera operator key in memory to sign real transactions on click. It is not part of the dashboard's build, is never deployed, and binds to `127.0.0.1` only.

```
cd app/server
npm install       # once
npm start         # node --env-file=../../.env index.mjs
```

Listens on `http://127.0.0.1:4317`. The dashboard's Demo tab (visible only under `vite dev`, absent from the production build — see `app/README.md`) calls it directly from the browser.

## Endpoints

All POST, all JSON in and out, every response carries `{ ok, headline, raw }` — `raw` is the actual SDK/ethers error object or the real transaction hashes, never a paraphrase.

- `GET /config` — public addresses only, never a key: `{ approverAddress, issuer1Address, issuer2Address }`. Lets the panel show/select real accounts without hardcoding them into `DemoView.tsx`.
- `GET /processor-balance` — `{ balance }`, the processor account's live harvest-token balance from the Hedera mirror node. No local bookkeeping.
- `POST /mint` — `{ grams?, lotRef?, certifier? }`. Defaults: `grams=5`, `lotRef` auto-generated, `certifier` from `.env` (Issuer 1). Mints on Hedera, anchors on Sepolia. Pass the Approver's address as `certifier` to see the mint refused before any transaction is sent — the Approver holds `MINTER_ROLE_ADMIN`, never `MINTER`.
- `POST /revoke-minter` — `{ account }`. Looks up the season's *current* EAC resource ID live (`bronteRegistry.findTokenId`) rather than trusting a cached value — a resource ID can shift (`TokenRegenerated`) and a stale one would silently revoke against the wrong resource. Revokes `account`'s `MINTER` role, **signed by the Approver's own key** (`ENS_APPROVER_KEY`), not the relayer's — see CLAUDE.md, "Three-level ENS permission structure."
- `POST /grant-minter` — `{ account }`, same lookup and signer, grants instead of revokes.
- `POST /transfer` — `{ grams }`. Moves `grams` of the harvest token from the operator to the processor account and anchors it. This is the explicit funding step for a transform — nothing tops up the processor on its own.
- `POST /transform` — `{ inputGrams?, outputGrams, lotRef?, productType? }`. Refuses up front, before touching Sepolia or Hedera, if the processor doesn't already hold at least `inputGrams` (see `checkProcessorFunded` in `scripts/relayer.mjs`) — call `/transfer` first. Otherwise checks the yield ceiling on Sepolia; a rejected claim never touches Hedera. An earlier version of this endpoint topped up the processor automatically on a shortfall (`ensureProcessorFunded`, now removed) — convenient for repeated takes, but it meant minting 100g and then transforming 1000g would just work, with the extra 900g materializing off-screen. The Demo tab's Transform flow section now makes mint/transfer/transform three explicit steps with the processor's live balance shown between them, so an underfunded transform fails visibly instead.

## Why this can't be the deployed dashboard

The Sepolia relayer key and Hedera operator key never leave this process. Putting them in a browser bundle or a public host (Vercel included) would mean anyone who opens the deployed site controls both keys. This server is not reachable from `quota-bronte.vercel.app` and never will be — the deployed dashboard stays strictly read-only, reading the public subgraph and Sepolia RPC directly, the same way it always has.
