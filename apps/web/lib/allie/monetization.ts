// Server-only: talks to Supabase with the service role.
import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { platformFeeRecipient } from "@/lib/fees";
import {
  getOrCreateSwiftPointsAccount,
  pointsToInternalUnits,
  recordLedgerEntry,
} from "@/lib/referral/ledger-service";
import { SWIFTPOINTS_USD_PER_POINT } from "@/lib/referral/types";

export type AllieTier = "free" | "pro";

export const allieSubscriptionsTable =
  process.env.SUPABASE_ALLIE_SUBSCRIPTIONS_TABLE ?? "allie_subscriptions";
export const allieLlmUsageTable =
  process.env.SUPABASE_ALLIE_LLM_USAGE_TABLE ?? "allie_llm_usage";

export const defaultDailyLlmCallBudget = 50;
/**
 * Tier 3 is ~4.5x the cost of Tier 2, so it gets its own, tighter ceiling.
 * This is the cap that bounds the worst case — without it a pathological day
 * could route the whole call budget through Sonnet.
 */
export const defaultDailyEscalationBudget = 10;
/** 0.002 USDC at 6 decimals. Charged per approved payment, not per LLM call. */
export const defaultPerPaymentFeeUnits = 2_000n;

/** How long one Pro payment (USDC or SwiftPoints) lasts. */
export const allieProTermDays = 30;

/** 0.002 USDC per ALLIE model call past the daily budget, paid in SwiftPoints. */
export const defaultOverageFeeUsdc = 0.002;

export function allieOverageFeeUsdc() {
  const parsed = Number.parseFloat(process.env.ALLIE_OVERAGE_FEE_USDC?.trim() ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultOverageFeeUsdc;
}

/** The overage fee in SwiftPoints: 0.002 USDC = 0.2 points. */
export function allieOveragePoints() {
  return Number((allieOverageFeeUsdc() / SWIFTPOINTS_USD_PER_POINT).toFixed(2));
}

/** The Pro fee in SwiftPoints, at the points' USDC value (5 USDC = 500). */
export function allieProPricePoints() {
  return Math.ceil(allieProMonthlyFeeUsdc() / SWIFTPOINTS_USD_PER_POINT);
}

export function allieProMonthlyFeeUsdc() {
  const raw = process.env.ALLIE_PRO_MONTHLY_FEE_USDC?.trim();
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function alliePerPaymentFeeUnits() {
  // ALLIE_PER_CALL_FEE_UNITS is the former name — it read as an inference
  // charge, which this never was. Still honoured so existing deployments
  // don't silently fall back to the default.
  const raw = (
    process.env.ALLIE_PER_PAYMENT_FEE_UNITS ??
    process.env.ALLIE_PER_CALL_FEE_UNITS
  )?.trim();

  if (raw && /^\d+$/.test(raw)) {
    return BigInt(raw);
  }

  return defaultPerPaymentFeeUnits;
}

export function allieDailyLlmCallBudget() {
  const raw = Number.parseInt(
    process.env.ALLIE_DAILY_LLM_CALL_BUDGET?.trim() ?? "",
    10,
  );

  return Number.isFinite(raw) && raw > 0 ? raw : defaultDailyLlmCallBudget;
}

export function allieDailyEscalationBudget() {
  const raw = Number.parseInt(
    process.env.ALLIE_DAILY_ESCALATION_BUDGET?.trim() ?? "",
    10,
  );

  return Number.isFinite(raw) && raw > 0 ? raw : defaultDailyEscalationBudget;
}

/** Falls back to the shared platform fee recipient when no ALLIE-specific one is set. */
export function allieProFeeRecipient() {
  return (
    process.env.ALLIE_PRO_FEE_RECIPIENT?.trim() || platformFeeRecipient() || ""
  );
}

type SubscriptionRow = {
  owner_wallet: string;
  tier: string;
  subscribed_at: string | null;
  expires_at: string | null;
  recurring_schedule_id: string | null;
};

export type AllieSubscription = {
  ownerWallet: string;
  tier: AllieTier;
  subscribedAt: string | null;
  expiresAt: string | null;
  recurringScheduleId: string | null;
};

function subscriptionFromRow(row: SubscriptionRow): AllieSubscription {
  return {
    ownerWallet: row.owner_wallet,
    tier: row.tier === "pro" ? "pro" : "free",
    subscribedAt: row.subscribed_at,
    expiresAt: row.expires_at,
    recurringScheduleId: row.recurring_schedule_id,
  };
}

export async function loadAllieSubscription(
  ownerWallet: string,
): Promise<AllieSubscription | null> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(allieSubscriptionsTable)
    .select("*")
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .maybeSingle<SubscriptionRow>();

  if (error) {
    throw new Error(error.message || "ALLIE subscription could not be loaded.");
  }

  return data ? subscriptionFromRow(data) : null;
}

/**
 * Free tier: Tier 1 classifier only — LLM calls are blocked.
 * Pro tier: all three tiers. An expired Pro subscription is free again.
 */
export async function getAllieTier(ownerWallet: string): Promise<AllieTier> {
  try {
    const subscription = await loadAllieSubscription(ownerWallet);

    if (!subscription || subscription.tier !== "pro") {
      return "free";
    }

    if (
      subscription.expiresAt &&
      new Date(subscription.expiresAt).getTime() < Date.now()
    ) {
      return "free";
    }

    return "pro";
  } catch {
    // Fail closed: an unknown subscription state does not unlock paid tiers.
    return "free";
  }
}

export async function saveAllieSubscription(input: {
  ownerWallet: string;
  tier: AllieTier;
  expiresAt?: string | null;
  recurringScheduleId?: string | null;
}) {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from(allieSubscriptionsTable).upsert(
    {
      owner_wallet: input.ownerWallet.toLowerCase(),
      tier: input.tier,
      subscribed_at:
        input.tier === "pro" ? new Date().toISOString() : null,
      expires_at: input.expiresAt ?? null,
      recurring_schedule_id: input.recurringScheduleId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_wallet" },
  );

  if (error) {
    throw new Error(error.message || "ALLIE subscription could not be saved.");
  }
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

/**
 * Today's included calls. `exhausted` is only true when usage was counted
 * and the budget is spent — the one case where paid overage calls may run.
 * A counting failure blocks (fails closed) without offering paid calls.
 */
export async function checkLlmBudget(
  ownerWallet: string,
): Promise<{ allowed: boolean; remaining: number; exhausted: boolean }> {
  const budget = allieDailyLlmCallBudget();

  try {
    const supabase = createSupabaseAdminClient();

    const { count, error } = await supabase
      .from(allieLlmUsageTable)
      .select("id", { count: "exact", head: true })
      .eq("owner_wallet", ownerWallet.toLowerCase())
      .gte("created_at", startOfTodayUtc());

    if (error) {
      throw new Error(error.message);
    }

    const used = count ?? 0;
    const remaining = Math.max(budget - used, 0);

    return { allowed: used < budget, remaining, exhausted: used >= budget };
  } catch {
    // Fail closed: if usage cannot be counted, do not spend on inference.
    return { allowed: false, remaining: 0, exhausted: false };
  }
}

/** Whether the wallet's SwiftPoints cover `calls` overage calls. */
export async function canPayAllieOverage(ownerWallet: string, calls = 1) {
  try {
    const account = await getOrCreateSwiftPointsAccount(ownerWallet.toLowerCase());
    const needed = pointsToInternalUnits(allieOveragePoints() * calls);
    return BigInt(account.available_balance_units) >= needed;
  } catch {
    return false;
  }
}

/**
 * Charge one overage call to SwiftPoints. Called once per model call that
 * ran past the daily budget. Returns false when the balance could not cover
 * it; the call has already happened, so this never throws.
 */
export async function chargeAllieOverage(
  ownerWallet: string,
  call: { tier: 2 | 3; model: string },
) {
  const points = allieOveragePoints();
  try {
    await recordLedgerEntry({
      walletAddress: ownerWallet.toLowerCase(),
      entryType: "ENTITLEMENT_UNLOCK",
      points: -points,
      idempotencyKey: `allie_overage_${ownerWallet.toLowerCase()}_${randomUUID()}`,
      description: `ALLIE Pro extra request (${allieOverageFeeUsdc()} USDC)`,
      metadata: {
        source: "allie_overage",
        feature: "ALLIE_PRO",
        feeUsdc: allieOverageFeeUsdc(),
        tier: call.tier,
        model: call.model,
      },
    });
    return true;
  } catch (error) {
    console.warn("[allie:overage]", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Pay for ALLIE Pro with SwiftPoints. A renewal while Pro is active extends
 * from the current expiry, so no paid days are lost. The ledger key names the
 * term being bought, so a double submit cannot charge for it twice.
 */
export async function subscribeAllieProWithPoints(ownerWallet: string) {
  const wallet = ownerWallet.toLowerCase();
  const current = await loadAllieSubscription(wallet);
  const now = Date.now();
  const activeUntil =
    current?.tier === "pro" && current.expiresAt ? new Date(current.expiresAt).getTime() : 0;
  const termStart = activeUntil > now ? activeUntil : now;
  const expiresAt = new Date(termStart + allieProTermDays * 24 * 60 * 60 * 1000).toISOString();
  const price = allieProPricePoints();

  const charged = await recordLedgerEntry({
    walletAddress: wallet,
    entryType: "ENTITLEMENT_UNLOCK",
    points: -price,
    // Same term start → same key: a retried or doubled request is one charge.
    idempotencyKey: `allie_pro_${wallet}_${new Date(activeUntil > now ? activeUntil : Math.floor(now / 60_000) * 60_000).toISOString()}`,
    description: `ALLIE Pro, ${allieProTermDays} days (${price} SwiftPoints)`,
    metadata: {
      source: "allie_pro",
      feature: "ALLIE_PRO",
      termDays: allieProTermDays,
      expiresAt,
      pricePoints: price,
    },
  });

  if (!charged.alreadyProcessed) {
    await saveAllieSubscription({ ownerWallet: wallet, tier: "pro", expiresAt, recurringScheduleId: null });
  }

  return { pricePoints: price, subscription: await loadAllieSubscription(wallet) };
}

/**
 * Separate, tighter ceiling on Tier 3 escalations. Checked immediately before
 * an escalation fires, so an exhausted budget degrades to the Tier 2 answer
 * rather than failing the message.
 */
export async function checkEscalationBudget(
  ownerWallet: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const budget = allieDailyEscalationBudget();

  try {
    const supabase = createSupabaseAdminClient();

    const { count, error } = await supabase
      .from(allieLlmUsageTable)
      .select("id", { count: "exact", head: true })
      .eq("owner_wallet", ownerWallet.toLowerCase())
      .eq("tier", 3)
      .gte("created_at", startOfTodayUtc());

    if (error) {
      throw new Error(error.message);
    }

    const used = count ?? 0;

    return { allowed: used < budget, remaining: Math.max(budget - used, 0) };
  } catch {
    // Fail closed: if escalations cannot be counted, do not spend on Tier 3.
    return { allowed: false, remaining: 0 };
  }
}

export async function recordLlmCall(
  ownerWallet: string,
  tier: 2 | 3,
  inputTokens: number,
  outputTokens: number,
  model: string,
  costEstimateUsdc: number,
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from(allieLlmUsageTable).insert({
    owner_wallet: ownerWallet.toLowerCase(),
    tier,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_estimate_usdc: costEstimateUsdc,
  });

  if (error) {
    // Usage accounting is best-effort; it must not fail the user's request.
    console.warn("[allie:usage]", error.message);
  }
}

export async function loadLlmUsageSummary(ownerWallet: string) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from(allieLlmUsageTable)
    .select("tier,input_tokens,output_tokens,cost_estimate_usdc")
    .eq("owner_wallet", ownerWallet.toLowerCase())
    .gte("created_at", startOfTodayUtc())
    .returns<
      {
        tier: number;
        input_tokens: number | null;
        output_tokens: number | null;
        cost_estimate_usdc: number | string | null;
      }[]
    >();

  if (error) {
    throw new Error(error.message || "ALLIE usage could not be loaded.");
  }

  const rows = data ?? [];

  return {
    calls: rows.length,
    inputTokens: rows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
    outputTokens: rows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
    // Estimates only — never presented as exact billing.
    costEstimateUsdc: Number(
      rows
        .reduce((sum, row) => sum + Number(row.cost_estimate_usdc ?? 0), 0)
        .toFixed(6),
    ),
  };
}
