# SwiftPay

SwiftPay is now organized as an npm-workspaces monorepo.

## Layout

- `apps/web` - Next.js frontend and API routes.
- `packages/contracts` - Hardhat config, Solidity contracts, ABI/bytecode artifacts, and deploy scripts.
- `packages/scripts` - Circle/AppKit operational scripts for wallets, transfers, swaps, and bridge flows.
- `packages/database` - Supabase SQL schema assets.

## Common Commands

Run commands from the repository root:

```sh
npm run dev
npm run build
npm run typecheck
npm run test
```

Contract and script commands are also routed from the root:

```sh
npm run contracts:compile
npm run contracts:deploy
npm run contracts:deploy-escrow
npm run contracts:deploy-swiftbatch
npm run create-wallet
npm run batch-wallets
npm run send-tokens
npm run bridge
npm run swap
npm run send
```

## Environment

Copy `.env.example` to `.env` at the repository root for contracts and scripts. The web app also loads the root `.env` through `apps/web/next.config.mjs`, so existing root-level environment files continue to work.

SwiftBatch requires:

```sh
PLATFORM_FEE_RECIPIENT=
NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT=
NEXT_PUBLIC_SWIFTBATCH_ADDRESS=
```

`PLATFORM_FEE_RECIPIENT` is passed to the SwiftBatch constructor, and `NEXT_PUBLIC_SWIFTBATCH_ADDRESS` must be set after deployment.
