# SwiftPay Multichain: receive and send USDC on other networks, one balance

## Context

SwiftPay's balance lives on Arc. Today USDC from any other network has no way in for most users:

- A Google or email sign-in holds a Circle user-controlled (PIN) smart wallet that exists on **Arc only**.
  `components/deposit/DepositPanel.tsx:253` shuts the bridge screen on those accounts for that reason.
- Anyone who pays that address from Base, Polygon, Arbitrum and so on sends USDC to an address the
  wallet may not control on that chain.
- The Send page can only send on Arc. The router already returns a `cctp` rail
  (`lib/payment-engine/router.ts:114`), but nothing executes it.

The goal is the Bybit experience: pick a network, get an address, USDC sent there shows up in the
balance by itself, and the same balance can be sent out to any supported network.

SwiftPay is **live on Arc mainnet**, so everything here is additive, behind a flag, proven on testnet
first, then canaried on mainnet with small amounts (same rollout as Checkout).

All paths are relative to `apps/web/` unless they start with `packages/`.

## The design in one line

**One balance, the user's Arc wallet. Every other network is a door in and a door out.**

Not a custodial ledger like Bybit's. If the money really lands on Arc, Save, Earn, BatchPay, RecurePay,
Circles, invoices, Checkout, payroll, @usernames and ALLIE all keep working untouched, and nobody has to
trust a SwiftPay database to say what they own.

| Bybit | SwiftPay |
| --- | --- |
| Funding balance | The user's Arc wallet (already the home of everything) |
| Deposit address per network | **Deposit address per network**, auto-swept to Arc (Part 1) |
| Withdraw to a network | **Send** with a Network picker, burned on Arc, minted at the destination (Part 2) |
| Internal transfer, instant and free | @username or Arc address, unchanged |

## What already exists (and gets reused)

- **App Kit 1.15.3** (`package.json`): Arc is a CCTP v2 chain (domain 26) with Circle's Forwarding Service
  enabled as a destination, and a Gateway v1 chain. Circle SCA wallets can authorise Gateway spends
  (ERC-1271). Gas Station SCAs with zero native balance are accepted (App Kit changelog 1.7 to 1.15).
- `lib/deposit-to-arc.ts`: CCTP bridge into Arc with step events, `retryBridge` resume, error copy, and the
  six mainnet and six testnet source chains. It becomes the base of the chain registry.
- `app/api/bridge/topup/route.ts`: a **server-signed** `kit.bridge` from a developer-controlled wallet to Arc
  with `useForwarder: true`. This is the template for the sweeper.
- `lib/agent-wallet/*`: developer-controlled wallets (ALLIE) already in production, plus
  `CIRCLE_DEVELOPER_CONTROLLED_API_KEY` and `CIRCLE_ENTITY_SECRET`.
- `lib/circle-webhook-signature.ts` and the `circles/webhooks/circle` route: Circle webhook verification.
- `lib/arc-transfers.ts`, `lib/wallet-history.ts` and the `incoming_transfer_cursors` table: reading the Arc RPC
  for incoming transfers. They will see every cross-chain arrival with no change, because it is an ordinary
  mint on Arc.
- Payment engine ledger (`payment_intents`, `payment_attempts`, `payment_settlements`): the home for outbound
  cross-chain sends.
- `components/checkout/pay-with-bridge.tsx`: payer-side bridging already in Checkout. Zero custody, keep it.

## Verified today (2026-10-05, live Circle API)

CCTP v2 reaches Arc from 17 domains and the Forwarding Service works in both directions. Fees from
`iris-api.circle.com/v2/burn/USDC/fees/{src}/{dst}?forward=true`, `med` level:

| Direction | Forward fee | Fast-transfer fee |
| --- | --- | --- |
| Base, Optimism, Arbitrum, Polygon, Avalanche, Solana to Arc | about $0.016 | 0 to 0.35 bps |
| Ethereum to Arc | about $0.016 | 0.25 bps |
| Arc to Base | about $0.055 | 0 |
| Arc to Optimism | about $0.051 | 0 |
| Arc to Polygon | about $0.061 | 0 |
| Arc to Arbitrum | about $0.078 | 0 |
| Arc to Avalanche | about $0.084 | 0 |
| Arc to Solana | about $0.137 | 0 |
| **Arc to Ethereum** | **about $1.17** | 0 |

Fast-transfer allowance: about 52.9M USDC. Recipients need no gas on the destination. The forward and fast
fees are taken out of the amount minted, so the receiver gets amount minus fees.

Circle Wallets support `ARC` mainnet for developer- and user-controlled wallets (EOA and SCA). Gas Station
bills 5% on top of real gas, paid by SwiftPay by card.

## Part 1: receive (deposit addresses, auto-swept to Arc)

### How it feels

Deposit or Receive: pick **Base / Polygon / Arbitrum / Optimism / Avalanche / Ethereum**. The screen shows
that network's address and a QR, "USDC on Base only", the minimum and the usual wait ("about 1 to 2
minutes"). The sender pays from Bybit, Binance, MetaMask, anything. SwiftPay sees it land, shows
**"Arriving: +50.00 USDC from Base"** right away, then the balance goes up. No PIN, no gas, no bridging screen.

### How it works

1. **Address.** On first use of a network the server creates a deposit wallet for the user (a Circle
   developer-controlled SCA with Gas Station on that chain, `refId` = the user's Arc wallet) and stores the
   address. Same-address-across-EVM is *not* assumed: one row per user per network.
2. **Detect.** Circle's `transactions.inbound` webhook, plus a "check now" poll from the open deposit screen,
   plus a cron backstop that lists balances of addresses with recent activity. A row is created in
   `chain_deposits` (state `DETECTED`) keyed by `(chain, source_tx_hash)`.
3. **Sweep.** When the transfer is `COMPLETE` and the balance is at or above the network minimum, the server
   runs the `/api/bridge/topup` pattern: burn on the source chain, **FAST**, `useForwarder: true`,
   `recipientAddress` read from the database (the owner's Arc wallet), never from the request.
4. **Credit.** State `CREDITED` only after the mint is seen on Arc through the RPC reader. The chain is the
   source of truth, not the bridge result (same rule as Checkout).
5. **Resume.** Any failed step keeps App Kit's result so `kit.retryBridge` continues from the last good step
   and never burns twice.

Typical time: seconds to two minutes on the L2s, longer on Ethereum.

### Custody, stated plainly

A deposit wallet is controlled by SwiftPay's entity secret for the minutes between "USDC arrived" and "USDC
minted on Arc". The final balance is always in the user's own non-custodial Arc wallet. This is the same trust
level SwiftPay already has with ALLIE's Agent Wallet, but it is a new category: *user funds under SwiftPay's
control, briefly*. So:

- Get a short legal read before mainnet (money-transmitter and VASP exposure, Terms wording).
- Guardrails: sweep within minutes, alert on any balance older than 15 minutes, the destination is only ever
  read from `profiles`, a kill switch, and a Gas Station policy limited to USDC and the CCTP contracts.
- **Pipeline is provider-agnostic** (`DepositAddressProvider`): the end state is Part 4, CREATE2 forwarder
  contracts that can only burn to the owner's Arc address, so SwiftPay cannot redirect funds at all.

### Money rules

- Minimum deposit: about **$1** on Base, Optimism, Arbitrum, Polygon, Avalanche; **$25** on Ethereum (gas).
  Below the minimum it waits (`BELOW_MIN`) and sweeps once the total passes it. Shown in the UI and never silent.
- Fees shown up front: Circle's forward fee (about 1.6 cents) comes off the minted amount. SwiftPay pays the
  source gas and does not charge a deposit fee at launch.
- USDC only. EURC is not bridgeable (only Base and Ethereum through CCTPx) so it stays Arc-only.
- Wrong token, unsupported EVM network: not credited. Circle documents recovery of funds sent to the same
  address on an unsupported EVM chain, so an admin recovery tool is a runbook item, not a promise.

### Data (new `packages/database/supabase/multichain.sql`, RLS on, service role only)

- `deposit_addresses`: `id`, `owner_wallet` (references `profiles`), `chain`, `address`, `provider`
  (`circle-dcw` | `forwarder`), `provider_wallet_id`; unique `(owner_wallet, chain)`; index on `lower(address)`.
- `chain_deposits`: `id`, `owner_wallet`, `chain`, `deposit_address_id`, `state` (`DETECTED` | `CONFIRMED` |
  `BELOW_MIN` | `SWEEPING` | `BURNED` | `CREDITED` | `FAILED` | `NEEDS_REVIEW`), `amount_in`, `fee_units`,
  `amount_credited`, `source_tx_hash`, `sender_address`, `burn_tx_hash`, `mint_tx_hash`, `bridge_result jsonb`,
  `attempts`, `last_error`, timestamps. Unique `(chain, source_tx_hash)`; one in-flight sweep per address.
- `chain_transfers` (outbound, Part 2): `intent_id` (payment engine), `dest_chain`, `dest_address`, amounts,
  `burn_tx_hash`, `state`.

### Code

New `lib/multichain/`:

- `chains.ts`: **one registry** `{ key, name, circleBlockchain, cctpDomain, appKitChain, chainId, usdcAddress,
  explorerTx, minDeposit, enabled }` for mainnet and testnet. `lib/deposit-to-arc.ts` imports it instead of its
  own list.
- `deposit-addresses.ts` (ensure and create), `detect.ts`, `sweep.ts` (state machine, advisory lock per
  address), `credit.ts`, `flag.ts`.
- Routes: `POST /api/multichain/addresses`, `GET /api/multichain/deposits` (the pending list),
  `POST /api/multichain/deposits/refresh`, `POST /api/multichain/webhooks/circle` (reuses signature check),
  `GET /api/cron/multichain` (uses `isCronAuthorized`).
- **Cron caveat:** all seven crons in `vercel.json` are daily. If the plan caps crons at daily, the
  webhook plus the client refresh carry the speed, and a per-minute backstop needs an external scheduler
  (GitHub Actions or QStash calling the route with `x-cron-secret`).

UI:

- Deposit hub: split "From another chain" into **Receive from another network** (every user, this feature)
  and **Bridge from my wallet** (the existing external-wallet flow).
- `components/dashboard/receive-share-card.tsx`: network switcher.
- Dashboard and Deposit: an "Arriving" row from `GET /api/multichain/deposits`.
- Activity: label the mint "From Base" using `chain_deposits`; notifications reuse the received-payment bell.
- Nine locale files in `lib/i18n/` plus `lib/support/knowledge.ts` for the support bot.

## Part 2: send (Network picker, burn on Arc, mint at the destination)

### How it feels

Send: Network = **Arc** (default; @usernames, contacts, everything as today) or **Base / Polygon / Arbitrum /
Optimism / Avalanche / Ethereum**. Picking another network asks for a raw 0x address (usernames always settle
on Arc) and shows a live quote: *"They receive 49.92 USDC on Base in about 30 seconds. Network fee $0.06."*
One PIN, one progress card, tracked in Activity. The recipient needs no gas.

### How it works

- Add the missing **`cctp` executor** to the payment engine: `kit.bridge` from the user's Arc wallet,
  `to: { chain, recipientAddress, useForwarder: true }`, FAST. The route already exists in the router; the
  intent, policy, ledger rows and ALLIE card ("CCTP bridge") are already wired. Update `railEstimatedSeconds.cctp`
  from 900 to about 30.
- **Signing.** External wallets sign natively. Circle PIN wallets go through the existing EIP-1193 shim
  (`lib/circle-eip1193.ts`), which is Arc-only, and that is exactly where an outbound burn happens, so it fits.
- **PIN count is the one real spike.** A plain bridge is approve plus burn, two PINs. Target is one:
  (a) a one-time max approval to Circle's TokenMessenger, then one PIN per send, or (b) a small
  `SwiftPayBridgeSend` wrapper like `SwiftPaySend` (pull funds, take the 0.1% fee, call `depositForBurn` with
  the forwarding hook) so fee and burn are one call. (b) keeps platform revenue and costs a contract deploy
  through the Safe and timelock. Decide after Phase 0.
- **Ethereum is the expensive door** ($1.17 forward fee). Enable it, but show the fee before the PIN and
  default the picker to the cheap networks.
- Quote with `kit.estimateBridge`; refuse amounts that do not cover fees.
- Resume with `retryBridge`; ledger row to `completed` only when the destination mint is seen.

## Part 3: guards

- Save, Earn, BatchPay, RecurePay, Circles, payroll, invoices, Checkout, usernames and the Agent Wallet stay
  **Arc-only**. Cross-chain is a door at the edge of the account, nothing inside it.
- Never trust the request for the destination of a sweep. Never mark credited from a bridge result alone.
- Abuse: addresses are created lazily (one per user per network, only for signed-in onboarded profiles), rate
  limited with `lib/rate-limit.ts`, minimum deposits stop dust from draining gas, and a daily gas budget with an
  alert in `lib/ops/operator-health.ts`.
- Screening: switch on Circle's compliance screening for the deposit wallets, and hold flagged deposits in
  `NEEDS_REVIEW`.
- Dedicated RPC per chain (the Arc public RPC already rate-limits: see `ARC_SERVER_RPC_URL`).
- Per-network enable list in env, and `NEXT_PUBLIC_MULTICHAIN_ENABLED` (same pattern as
  `NEXT_PUBLIC_CHECKOUT_ENABLED`). Network-scope any browser storage, as the mainnet launch taught.

## Phases

**Phase 0: spikes and sign-offs (1 to 2 days).** Nothing ships. Answers the unknowns below.

1. SCA address parity: `POST /user/wallets` with `SCA` and a second blockchain for a Google user on mainnet
   or testnet. Does Base come back at the same address as Arc? (Circle documents unified addressing, but the
   example is EOA and it does not mention Arc or SCA.) If yes, add a safety net: provision the user's own
   wallet on each network so a payer who pastes the Arc address on Base is recoverable with one tap.
2. Gas Station on Arc **mainnet** and on Base for a developer-controlled SCA (docs conflict on Arc).
3. End to end on testnet: deposit wallet on Base Sepolia, App Kit server-side FAST bridge to Arc with the
   forwarder; record time and fees.
4. Arc to Base from a Circle PIN wallet through the shim; count the PINs; pick (a) or (b).
5. Legal read on briefly controlling deposits; confirm Circle compliance screening is available.
6. Dedicated RPC providers for the six chains; confirm whether cron can run every minute.

**Phase 1: backend, invisible (about 1 week).** Registry, SQL, flag, address provisioning, webhook and
detection, sweep state machine, credit check, unit tests in the existing `node --test` style. Testnet only.

**Phase 2: receive UI (about 1 week).** Receive screen with network switcher, pending row, notifications,
activity labels, locales. Testnet preview with the flag on, then a mainnet smoke test of $1 to $5 from Base
with the flag off for everyone but the owner.

**Phase 3: send (about 1 week).** `cctp` executor, Network picker, quote, tracking, ALLIE capability; the
wrapper contract if the spike says so. Testnet, then mainnet smoke tests Arc to Base and Arc to Polygon.

**Phase 4: harden and launch (about 1 week).** Operator-health cards (stuck deposits, unswept balance, gas
spend), admin recovery runbook, alerts, allowlisted canary users, then general availability network by network
(Base and Polygon first, Ethereum last). Rough total: **4 to 5 weeks** to six networks, and these are
estimates, not commitments.

**Phase 5: later, in this order.**

1. Non-custodial deposit addresses: CREATE2 forwarder contracts per user that can only burn to the owner's
   Arc address, triggered by a Gas Station relayer. Needs an audit. Swaps in behind `DepositAddressProvider`
   with no UI change.
2. More CCTP networks, all already routable to Arc: **Solana**, Unichain, Linea, Sonic, World Chain, Sei,
   HyperEVM, Ink, Codex.
3. **TRON and BSC are not CCTP networks.** Much of the Nigerian flow runs on USDT over TRON and BSC, so a
   real "like Bybit" on that corridor needs a partner (Blockradar, an aggregator, or a ramp provider from the
   ramp research) and a swap step. Keep it separate from this plan.
4. Optional: Circle Gateway unified balance for sub-second sends out. Not needed for the core, because a
   third-party sender cannot deposit into Gateway; it would only speed up outbound.

## Alternatives considered

- **Custodial ledger (real Bybit).** Fastest to credit, but SwiftPay would owe users money it holds, every
  on-chain feature would need to read a database instead of the chain, and the licensing burden is the
  largest. Rejected.
- **"Move to Arc" button on the user's own address (earlier idea).** Fully non-custodial but not automatic:
  every arrival needs a PIN. Kept only as the safety net from spike 1.
- **Gateway as the balance.** Puts the balance in a contract on one chain and does not accept plain
  transfers from other people. Not the core.

## Verification

- Unit tests: state machine transitions, idempotency on webhook replay, below-minimum accumulation, fee
  math, destination always from `profiles`, registry per network.
- Testnet preview: deposit from each of the six test networks; kill the sweeper mid-burn and resume without
  a second burn; replay a webhook; two deposits in a row; one below the minimum.
- Mainnet canary with the owner's wallets: $2 Base to Arc, $2 Polygon to Arc, $2 Arc to Base, $2 Arc to
  Polygon, one deliberate wrong-network send to confirm it is held, not lost.
- `pnpm test` (typecheck plus every suite) before each phase merges.

## Decisions for the owner

1. **Custody posture for launch:** SwiftPay-held deposit wallets first (recommended, about 4 to 5 weeks, brief
   control of funds, legal read) or wait for the forwarder contracts (about 3 weeks longer plus an audit).
2. **Which networks at launch:** recommended Base, Polygon, Arbitrum, Optimism, Avalanche, with Ethereum last
   and behind a high minimum.
3. **Deposit fee:** free at launch, absorbing about 2 to 4 cents of gas per deposit (recommended), or pass the
   gas through.
4. **Outbound fee:** keep the 0.1% platform fee on cross-chain sends (needs the wrapper contract) or send at
   cost.

## Not yet verified (assumptions to test in Phase 0)

- SCA address parity across chains, and across Arc.
- Gas Station on Arc mainnet, and its policy limits.
- The exact PIN count for an outbound burn from a Circle wallet.
- Circle's per-wallet pricing for developer-controlled wallets at user scale (one per user per network).
- Compliance screening availability for the deposit wallets.
