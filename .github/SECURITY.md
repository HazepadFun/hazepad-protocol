# Security Policy

## Reporting a problem

If you find a vulnerability in the site or in anything this repository describes, please do not open a public issue. Send a private report through the contact route the project states in its register once one exists. Until then, hold the details and check back.

A useful report names what you found, how to reproduce it and what you think the impact is.

## Scope

In scope:
- The static site in `dist/` and the sources that build it
- The content security policy and response headers
- The contract address slot and its copy action

Out of scope:
- Third-party feeds (Solana RPC providers, DefiLlama, DexScreener)
- Findings that need a modified browser or a compromised device

## Handling

Reports are acknowledged, reproduced, fixed and then disclosed with credit if the reporter wants it.

## Notes for users

- The site never asks for a seed phrase, a private key or a wallet signature
- Only copy the contract address from the slot at the top of the official site once it is stated
- An inert slot means no address has been stated yet. Treat any address offered elsewhere as unconfirmed
