# Hazepad Architecture

## Site

A static site. There is no server, no database and no build-time network access.

```
brand/ + reference/  --tools/assets.mjs-->  src/css/tokens.css, dist/assets/*, dist/favicon.svg
src/register.json    --src/render.js----->  dist/index.html (slots, CSP, public register)
src/js, src/css      --tools/build.mjs--->  dist/js, dist/css/app.css
```

`dist/` is the whole deploy.

### The register
`src/register.json` holds one record per external fact: domain, chain, RPC, contract, X, GitHub. Each record has a `state`: `stated`, `absent` or `unconfirmed`, and a private `source` note. Sources never reach the page; only the public projection is embedded.

### Slots
`src/render.js` is shared by the build and the gates. It turns records into markup:

- **Contract slot.** `stated` renders the address in full with a copy button. `absent` and `unconfirmed` render an inert slot with no button.
- **Social icons.** Both are always present. A record that is `stated` and whose URL is https on the right host becomes a link with a handle derived from the URL. Anything else is an inert mark with no `href`.
- **Info tiles.** Chain, Contract and RPC only.

### The gate
`src/js/gate.js` accepts any string of 32 to 44 characters in the base58 alphabet. It never rejects on a guess about checksums or byte length. Hex strings fail because `0`, `O`, `I` and `l` are outside the alphabet.

### Live layer
`src/js/live.js` runs three feeds through `src/js/backoff.js`:

- Slot: JSON-RPC `getSlot` on the stated RPC
- Chain value: DefiLlama chains list matched on the slug `solana`
- Top pairs: DexScreener search results tagged `solana`, ranked by 24 hour volume

The poller doubles its wait after each failure, adds jitter, caps the wait, resets on success and stops while the tab is hidden. Health is derived from the slot feed: Connecting until the first answer, Live after one, Offline after three failures in a row.

### Content security policy
Built from the register so the RPC origin follows the record. Scripts, styles and fonts load from the site itself. Connections are limited to the RPC, DefiLlama and DexScreener. Images may also load from the two DexScreener image hosts.

## Protocol

```
swap --> Fee Gate --> Route Map --> Rig Desk --> Payout Ledger --> Holder Weights --> wallets
```

Each stage hands its output to the next and writes a record. The site does not touch this path yet; the contract address is not stated.
