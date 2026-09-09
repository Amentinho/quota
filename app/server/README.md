# app/server

A local-only Express server backing the dashboard's **Demo** tab, built for the video recording. It imports the real relayer functions (`scripts/relayer.mjs`, `ens/grant-minter.mjs`) and holds the Sepolia relayer key and Hedera operator key in memory to sign real transactions on click. It is not part of the dashboard's build, is never deployed, and binds to `127.0.0.1` only.

```
cd app/server
npm install       # once
npm start         # node --env-file=../../.env index.mjs
```

Listens on `http://127.0.0.1:4317`. The dashboard's Demo tab (visible only under `vite dev`, absent from the production build — see `app/README.md`) calls it directly from the browser.

## Endpoints

All POST, all JSON in and out, every response carries `{ ok, headline, raw }` — `raw` is the actual SDK/ethers error object or the real transaction hashes, never a paraphrase.

- `POST /mint` — `{ grams?, lotRef?, certifier? }`. Defaults: `grams=5`, `lotRef` auto-generated, `certifier` from `.env`. Mints on Hedera, anchors on Sepolia.
- `POST /revoke-minter` — no body. Looks up the season's *current* EAC resource ID live (`bronteRegistry.findTokenId`) rather than trusting a cached value — a resource ID can shift (`TokenRegenerated`) and a stale one would silently revoke against the wrong resource. Revokes the certifier's `MINTER` role.
- `POST /grant-minter` — same lookup, restores the role. Run this after `/revoke-minter` or the certifier stays locked out for later use — including your next take.
- `POST /transform` — `{ inputGrams?, outputGrams, lotRef?, productType? }`. Checks the yield ceiling on Sepolia first; a rejected claim never touches Hedera. On success, tops up the processor account (both its harvest-token balance and its HBAR, needed to pay the harvest token's custom fee when it signs the retirement transfer) from the operator automatically, *via a real anchored mint, not a bare transfer* — see the comment on `ensureProcessorFunded` in `scripts/relayer.mjs` for why a bare transfer briefly took the harvest season's `inCirculationGrams` negative on the live dashboard the first time this was tested for real. Repeatable across takes without a manual prep step.

## Why this can't be the deployed dashboard

The Sepolia relayer key and Hedera operator key never leave this process. Putting them in a browser bundle or a public host (Vercel included) would mean anyone who opens the deployed site controls both keys. This server is not reachable from `quota-bronte.vercel.app` and never will be — the deployed dashboard stays strictly read-only, reading the public subgraph and Sepolia RPC directly, the same way it always has.
