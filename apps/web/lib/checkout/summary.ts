// Server-only. Kept apart from service.ts so the account overview can import
// it without a cycle (service.ts imports from lib/account/service).
import { accountDb, accountTables, readAccountDbError } from "@/lib/account/db";
import { moneyNumber, roundMoney } from "@/lib/account/money";
import type { ChargeSummary } from "@/lib/checkout/types";

function nowIso() {
  return new Date().toISOString();
}

/** Today's (UTC) paid charges, volume and tips, plus how many are still open. */
export async function chargeSummary(wallet: string): Promise<ChargeSummary> {
  const supabase = accountDb();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [paid, open] = await Promise.all([
    supabase
      .from(accountTables.charges)
      .select("amount_received,tip_amount")
      .eq("wallet_address", wallet.toLowerCase())
      .eq("status", "PAID")
      .gte("paid_at", startOfDay.toISOString()),
    supabase
      .from(accountTables.charges)
      .select("id", { count: "exact", head: true })
      .eq("wallet_address", wallet.toLowerCase())
      .eq("status", "OPEN")
      .gt("expires_at", nowIso()),
  ]);
  if (paid.error) throw new Error(readAccountDbError(paid.error, "Could not load charge totals."));
  if (open.error) throw new Error(readAccountDbError(open.error, "Could not load charge totals."));
  const rows = (paid.data ?? []) as Array<{ amount_received: string; tip_amount: string }>;
  return {
    openCount: open.count ?? 0,
    todayCount: rows.length,
    todayTips: roundMoney(rows.reduce((sum, row) => sum + moneyNumber(row.tip_amount), 0)),
    todayVolume: roundMoney(rows.reduce((sum, row) => sum + moneyNumber(row.amount_received), 0)),
  };
}
