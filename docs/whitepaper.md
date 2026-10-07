# Hazepad Whitepaper

## 1. The idea

Most launchpad tokens earn their creators a trickle of fees and give holders nothing but a price chart. Hazepad changes where the fees go. A share of every trade is routed into proof-of-work mining, and what the rigs return is paid out to the people holding the token.

The result is a token with a working economy behind it: trading activity feeds hash, hash produces coin, coin reaches holders.

## 2. The problem

A launched token usually has three weak points.

1. **Fees go idle.** Creator cuts accumulate in a wallet and wait for a decision that may never arrive.
2. **Holders have no claim on activity.** Volume helps the creator and the venue. It does nothing for the wallet that simply holds.
3. **Real output is out of reach.** Turning fees into mining capacity takes contracts, hosting and bookkeeping that a small team cannot build alone.

## 3. How Hazepad works

### 3.1 Fee Gate
The Fee Gate collects the creator cut of each swap as it settles. Nothing waits in an intermediate wallet.

### 3.2 Route Map
The creator divides the cut across up to four routes in steps of five percent. The map must add to a full hundred. Available routes:

- **Pool hash:** rented capacity pointed at a public pool.
- **Owned rigs:** machines bought and hosted on the token's behalf.
- **Hash market:** spot capacity bought from open markets.
- **Reserve:** funds held back and not routed.
- **Holder drop:** funds paid straight to holders without passing through a rig.

### 3.3 Rig Desk
The Rig Desk turns routed funds into capacity and keeps a record of every purchase.

### 3.4 Payout Ledger
Whatever the rigs return is recorded against the token. The ledger is public so any holder can check it.

### 3.5 Holder Weights
At each payout snapshot the protocol reads balances and divides the haul in proportion. A wallet holding twice as much receives twice as much.

## 4. What holders should expect

Mining output is not a promise. It moves with coin prices, network difficulty and pool luck, and it can land below the fees that were routed into it. A route map that leans on the reserve or on holder drops trades output for steadiness. Hazepad shows the numbers; it does not guarantee them.

## 5. Principles

- **State only what is known.** Anything not yet confirmed is shown as absent, never guessed.
- **No hidden steps.** Every route, purchase and payout has a public record.
- **Creators choose, the protocol enforces.** The route map is the creator's decision; once set, the contracts follow it exactly.

## 6. Status

The site and the register are live. The contract address is not yet stated, so launching is closed. The route map, simulator and draft builder on the site run in the browser with no on-chain effect.
