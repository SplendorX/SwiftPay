# SwiftPay Traction Analytics

SwiftPay tracks real product traction through server-side Supabase storage and a protected admin dashboard.

## Apply

1. Apply `packages/database/supabase/traction-events.sql`.
2. Set:

```sh
SUPABASE_TRACTION_EVENTS_TABLE=traction_events
TRACTION_ADMIN_SECRET=
```

3. Open `/admin/traction`.
4. Enter the same secret and load metrics.

## Smoke Test

After applying the SQL and env values, trigger one event from the browser console while signed into the app:

```js
fetch("/api/traction/events", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    eventType: "dashboard_active",
    sessionId: crypto.randomUUID(),
    source: "manual_smoke_test",
  }),
});
```

Then open `/admin/traction` and confirm `dashboard_active` appears in event counts. Delete smoke-test rows before using screenshots as investor evidence.

## Metrics

The admin dashboard reports:

- registered wallets from profiles
- active wallets from tracked actors
- stablecoin payment and swap volume
- transaction count from tracked transaction hashes
- payment success rate
- Earn AUM from indexed Earn deposits and withdrawals
- savings AUM from savings deposits and withdrawals
- recurring schedule count
- event counts and latest events

## Event Names

Use these names for consistent aggregation:

| Event | When to record |
| --- | --- |
| `dashboard_active` | A connected wallet opens the dashboard |
| `payment_submitted` | A Circle or external wallet payment returns a transaction hash |
| `payment_failed` | A payment attempt fails before submission |
| `swap_submitted` | A swap returns a transaction hash |
| `savings_deposit_completed` | A manual or Spend&Save deposit confirms |
| `savings_withdraw_completed` | A savings withdrawal confirms |
| `earn_deposit_completed` | An Earn deposit confirms |
| `earn_withdraw_completed` | An Earn withdrawal confirms |
| `recurring_schedule_created` | A recurring payment schedule is created |

## Client Helper

Use `trackTractionEvent` from `apps/web/lib/traction/client.ts`.

```ts
trackTractionEvent({
  amount: "25.00",
  chainId: 5042002,
  currency: "USDC",
  eventType: "payment_submitted",
  source: "dashboard",
  txHash,
  walletAddress,
});
```

Telemetry must never block product flows. The helper intentionally swallows network errors.

## Data Notes

- Payment and swap volume come from submitted transaction events with hashes.
- Savings AUM is net indexed savings deposits minus withdrawals.
- Earn AUM here is net indexed Earn deposits minus withdrawals. Use the existing Earn admin health surface for on-chain TVL and strategy status.
- Active wallets are unique tracked wallets, Circle social IDs, or anonymous sessions in the selected range.
