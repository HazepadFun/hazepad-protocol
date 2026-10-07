# Hazepad

Hazepad is a launchpad protocol on Solana. A slice of every trade in a launched token is caught as a creator cut, divided by a route map the creator sets, and put to work in proof-of-work mining. Holders collect the output in proportion to what they hold at each payout snapshot.

This repository holds the public site for `hazepad.fun` and the written design of the protocol.

## What is here

| Path | Purpose |
| --- | --- |
| `src/` | Site source: page template, styles, scripts, register |
| `src/register.json` | Every external fact, one record each, with a state of `stated`, `absent` or `unconfirmed` |
| `src/css/tokens.css` | The only file that holds colour literals; generated from the brand art |
| `brand/`, `reference/` | Logo files and art the palette is sampled from |
| `tools/` | Asset pipeline, build and the gate suite |
| `docs/` | Whitepaper, tokenomics, roadmap, architecture |
| `dist/` | Build output. This folder is the deploy |

## Build and check

```bash
npm install
npm run build
npm run gates
```

`npm run build` empties `dist/`, reads every file in `brand/` and `reference/`, regenerates the palette, logos, favicon and social card, then writes the page. Drag `dist/` to Cloudflare Pages. It carries its own `_headers` file with the content security policy.

`npm run gates` runs the synthetic-fixture suite. It exercises both branches of the contract slot and the social icons from fixtures, so it passes whatever the register currently says.

## Stating a fact

Nothing external is typed into the page by hand. To state the contract address, open `src/register.json` and change the record:

```json
"contract": { "id": "contract", "label": "Contract", "state": "stated", "value": "<base58 address, 32 to 44 characters>" }
```

The same applies to `x` and `github`, which take a `url`. The handle shown to visitors is derived from the URL. A record that is not `stated` renders inert and carries no link. Rebuild and redeploy.

## Live data

| Feed | Source | Cadence |
| --- | --- | --- |
| Slot | `getSlot` on the public Solana RPC | every few seconds, glides between polls |
| Chain value | DefiLlama chains list, matched on the slug `solana` | once a minute |
| Top pairs | DexScreener search, pairs tagged `solana`, ranked by 24 hour volume | every 45 seconds |

Every feed backs off exponentially with jitter after a failure, shows a dash while it has nothing to show, and stops polling while the tab is hidden.

## Licence

MIT. See `LICENSE`.
