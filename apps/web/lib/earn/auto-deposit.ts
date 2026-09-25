import { createSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * Earn auto-deposit rules.
 *
 * Two modes, because unattended execution needs delegated authority that not
 * every wallet wants to grant:
 *
 * - SWEEP: the rule decides *when* and *how much*; the owner still signs.
 *   Offered as one tap the next time they open SwiftPay. Works for Circle and
 *   external wallets alike, needs nothing deployed, but only fires when they
 *   visit — the schedule is a floor, not a guarantee.
 *
 * - UNATTENDED: the owner grants a standing USDC allowance to
 *   EarnAutoSaveExecutor once, and the operator deposits on schedule with no
 *   prompt. A real cron, at the cost of delegated spend authority.
 */

export const autoDepositTable =
  process.env.SUPABASE_EARN_AUTO_DEPOSIT_RULES_TABLE ??
  "earn_auto_deposit_rules";

export const autoDepositExecutionsTable =
  process.env.SUPABASE_EARN_AUTO_DEPOSIT_EXECUTIONS_TABLE ??
  "earn_auto_deposit_executions";

export type AutoDepositMode = "SWEEP" | "UNATTENDED";
export type AutoDepositFrequency = "daily" | "weekly" | "monthly";

export type AutoDepositRule = {
  amount_usdc: number;
  created_at: string;
  enabled: boolean;
  frequency: AutoDepositFrequency;
  id: string;
  last_error: string | null;
  last_run_at: string | null;
  min_balance_floor: number;
  mode: AutoDepositMode;
  next_run_at: string;
  updated_at: string;
  vault_address: string;
  wallet_address: string;
};

export function isAutoDepositMode(value: unknown): value is AutoDepositMode {
  return value === "SWEEP" || value === "UNATTENDED";
}

export function isAutoDepositFrequency(
  value: unknown,
): value is AutoDepositFrequency {
  return value === "daily" || value === "weekly" || value === "monthly";
}

const FREQUENCY_DAYS: Record<AutoDepositFrequency, number> = {
  daily: 1,
  monthly: 30,
  weekly: 7,
};

/**
 * When a rule becomes due again.
 *
 * Always measured from now rather than from the previous due date, so a rule
 * that was missed for a month fires once and resets — it never accumulates a
 * backlog of deposits to fire in a burst.
 */
export function nextRunAt(
  frequency: AutoDepositFrequency,
  from: Date = new Date(),
): string {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + FREQUENCY_DAYS[frequency]);
  return next.toISOString();
}

export function autoDepositDb() {
  return createSupabaseAdminClient();
}

export async function getAutoDepositRule(
  walletAddress: string,
): Promise<AutoDepositRule | null> {
  const supabase = autoDepositDb();
  const { data, error } = await supabase
    .from(autoDepositTable)
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load the auto-deposit rule.");
  }

  return (data as AutoDepositRule | null) ?? null;
}

export async function upsertAutoDepositRule(input: {
  amountUsdc: number;
  enabled?: boolean;
  frequency: AutoDepositFrequency;
  minBalanceFloor: number;
  mode: AutoDepositMode;
  vaultAddress: string;
  walletAddress: string;
}): Promise<AutoDepositRule> {
  const supabase = autoDepositDb();
  const wallet = input.walletAddress.toLowerCase();
  const existing = await getAutoDepositRule(wallet);

  const payload = {
    amount_usdc: input.amountUsdc,
    enabled: input.enabled ?? true,
    frequency: input.frequency,
    last_error: null,
    min_balance_floor: input.minBalanceFloor,
    mode: input.mode,
    updated_at: new Date().toISOString(),
    vault_address: input.vaultAddress.toLowerCase(),
    wallet_address: wallet,
    // Keep an armed rule's schedule when only its amount changes; a brand new
    // rule waits a full interval rather than firing the moment it is saved.
    ...(existing ? {} : { next_run_at: nextRunAt(input.frequency) }),
  };

  const { data, error } = await supabase
    .from(autoDepositTable)
    .upsert(payload, { onConflict: "wallet_address" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to save the auto-deposit rule.");
  }

  return data as AutoDepositRule;
}

export async function deleteAutoDepositRule(walletAddress: string) {
  const supabase = autoDepositDb();
  const { error } = await supabase
    .from(autoDepositTable)
    .delete()
    .eq("wallet_address", walletAddress.toLowerCase());

  if (error) {
    throw new Error(error.message || "Failed to remove the auto-deposit rule.");
  }
}

/** Rules whose next run has come due. Used by the operator job. */
export async function listDueRules(
  mode: AutoDepositMode,
  limit = 25,
): Promise<AutoDepositRule[]> {
  const supabase = autoDepositDb();
  const { data, error } = await supabase
    .from(autoDepositTable)
    .select("*")
    .eq("enabled", true)
    .eq("mode", mode)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "Failed to load due auto-deposit rules.");
  }

  return (data ?? []) as AutoDepositRule[];
}

export async function recordExecution(input: {
  amountUsdc: number;
  executionId: string;
  mode: AutoDepositMode;
  reason?: string | null;
  ruleId: string;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  txHash?: string | null;
  vaultAddress: string;
  walletAddress: string;
}) {
  const supabase = autoDepositDb();
  await supabase.from(autoDepositExecutionsTable).insert({
    amount_usdc: input.amountUsdc,
    execution_id: input.executionId,
    mode: input.mode,
    reason: input.reason ?? null,
    rule_id: input.ruleId,
    status: input.status,
    tx_hash: input.txHash ?? null,
    vault_address: input.vaultAddress,
    wallet_address: input.walletAddress.toLowerCase(),
  });
}

/**
 * Advance a rule after a successful run.
 *
 * Only success moves the clock. A declined prompt or a failed deposit leaves
 * the rule due, so it is offered again rather than silently skipping a period.
 */
export async function markRuleRan(input: {
  frequency: AutoDepositFrequency;
  walletAddress: string;
}) {
  const supabase = autoDepositDb();
  const now = new Date();
  await supabase
    .from(autoDepositTable)
    .update({
      last_error: null,
      last_run_at: now.toISOString(),
      next_run_at: nextRunAt(input.frequency, now),
      updated_at: now.toISOString(),
    })
    .eq("wallet_address", input.walletAddress.toLowerCase());
}

export async function markRuleError(walletAddress: string, message: string) {
  const supabase = autoDepositDb();
  await supabase
    .from(autoDepositTable)
    .update({
      last_error: message.slice(0, 300),
      updated_at: new Date().toISOString(),
    })
    .eq("wallet_address", walletAddress.toLowerCase());
}
