# SwiftPay Earn contracts

## Architecture

```
User USDC
  → SwiftPayVault (ERC-4626, performance fee HWM)
    → AaveUsdcYieldStrategy
      → Aave V3 Pool.supply / withdraw  (or MockAavePool on testnet)
        → aToken balance = strategy.totalAssets()
```

## Modes

| Mode | When | Strategy flag |
|------|------|----------------|
| **simulation** | No official Aave addresses / Arc testnet default | `isSimulation = true` |
| **live** | Verified Pool + aToken in env | `isSimulation = false` |
| **unavailable** | Mainnet without Aave config | do not deploy mock |

## Deploy testnet (simulation)

```bash
pnpm compile
pnpm deploy:earn
# uses MockAavePool when AAVE_POOL_ADDRESS_TESTNET is empty
```

## Switch to live Aave (same code path)

1. Obtain **official** Arc Aave Pool + USDC aToken addresses (never invent).
2. Set env:

```bash
AAVE_POOL_ADDRESS_TESTNET=0x...   # or MAINNET vars
AAVE_ATOKEN_USDC_TESTNET=0x...
EARN_NETWORK=arcTestnet           # or arcMainnet
NEXT_PUBLIC_EARN_MODE=live
```

3. Redeploy strategy (or `vault.setStrategy(newStrategy)` after migrating capital).

Mainnet:

```bash
EARN_NETWORK=arcMainnet \
ARC_MAINNET_CHAIN_ID=... \
ARC_MAINNET_RPC_URL=... \
ARC_MAINNET_USDC=... \
AAVE_POOL_ADDRESS_MAINNET=... \
AAVE_ATOKEN_USDC_MAINNET=... \
pnpm deploy:earn:mainnet
```

Simulation **cannot** deploy on mainnet (`assertMainnetReady` + deploy script guards).

## Security notes

- ERC-4626 virtual offset (`_decimalsOffset = 3`) against inflation attacks
- Performance fee only on assets above high-water mark (not deposits)
- Max fee 20% BPS cap
- Ownable2Step, Pausable, ReentrancyGuard, SafeERC20
- Strategy isolation via `IYieldStrategy`

## Auto-Save

`EarnAutoSaveExecutor` pulls user-approved USDC and deposits into the vault for the user.

1. User enables Auto-Save in `/earn` and accepts authorization text.
2. User `approve`s USDC to the executor.
3. Cron `/api/cron/earn` evaluates rules:
   - Skip if `balance < min + amount` → *"Auto-save skipped — available balance below your minimum."*
   - Else operator calls `executeAutoSave` (or marks `awaiting_wallet` if no operator).

## Indexer & APY

- Indexer: vault `Deposit` / `Withdraw` / `PerformanceFeeCollected` → Supabase
- APY: Aave `getReserveData.currentLiquidityRate` when live; null in simulation (never faked)

## Tests

```bash
pnpm test
```
