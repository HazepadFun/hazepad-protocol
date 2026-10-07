# Hazepad Tokenomics

This document describes how value is meant to move around the `$HAZEPAD` token and around tokens launched through the protocol. It carries no supply, allocation or price figures. Figures enter this file only after they are stated and recorded in `src/register.json`.

## Two kinds of token

### Tokens launched through Hazepad
Each launched token has its own route map. A creator cut on every swap flows through the Fee Gate, is divided by the map, and the routed share becomes mining capacity. Payouts go to that token's holders, weighed by balance at the snapshot.

### The Hazepad token
`$HAZEPAD` is the token behind the launchpad. Its role is to align the people who use the protocol with the people who keep it running. Specific utility, supply and distribution are not yet stated.

## Where a cut can go

| Route | What it does | Trade-off |
| --- | --- | --- |
| Pool hash | Rents capacity pointed at a public pool | Steady output, rental cost |
| Owned rigs | Buys and hosts machines | Slower to start, assets remain |
| Hash market | Buys spot capacity | Flexible, price-sensitive |
| Reserve | Holds funds back | No output while held |
| Holder drop | Pays holders directly | Immediate, no mining exposure |

A map may use at most four routes, in steps of five percent, and must total one hundred percent.

## Payout weighting

For each snapshot, a wallet's share of the payout equals its balance divided by the total balance of eligible wallets. Wallets that the protocol itself controls are not eligible.

## What is not stated

- Total supply
- Allocation between team, treasury, community and liquidity
- Vesting or lock terms
- Any fee rate on trades

These stay blank until the team states them. The site never renders a figure that the register does not hold.
