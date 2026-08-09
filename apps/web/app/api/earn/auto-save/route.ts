import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import {
  AUTO_SAVE_AUTHORIZATION_TEXT,
  earnAutoSaveExecutorAddress,
  nextRunAtFromFrequency,
  type AutoSaveFrequency,
} from "@/lib/earn/auto-save";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const rulesTable =
  process.env.SUPABASE_EARN_AUTO_SAVE_RULES_TABLE ?? "earn_auto_save_rules";
const executionsTable =
  process.env.SUPABASE_EARN_AUTO_SAVE_EXECUTIONS_TABLE ??
  "earn_auto_save_executions";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) return null;
  return getAddress(value).toLowerCase();
}

function normalizeFrequency(value: unknown): AutoSaveFrequency | null {
  return value === "daily" || value === "weekly" || value === "monthly"
    ? value
    : null;
}

function normalizeDecimal(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value.toString();
  }
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const wallet = normalizeWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  if (!wallet) {
    return jsonError("ownerWallet is required.", 400);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: rule, error } = await supabase
      .from(rulesTable)
      .select("*")
      .eq("owner_wallet", wallet)
      .maybeSingle();

    if (error) {
      return jsonError(error.message, 500);
    }

    const { data: executions } = await supabase
      .from(executionsTable)
      .select("*")
      .eq("owner_wallet", wallet)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      rule: rule ?? null,
      executions: executions ?? [],
      authorizationText: AUTO_SAVE_AUTHORIZATION_TEXT,
      executorAddress: earnAutoSaveExecutorAddress(),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Auto-Save could not be loaded. Apply earn-vault.sql.",
      500,
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const wallet = normalizeWallet(body.ownerWallet);
  if (!wallet) {
    return jsonError("ownerWallet is required.", 400);
  }

  const frequency = normalizeFrequency(body.frequency) ?? "weekly";
  const minIdle = normalizeDecimal(body.minIdleBalance) ?? "100";
  const saveAmount = normalizeDecimal(body.saveAmount) ?? "50";
  const keepBalance = normalizeDecimal(body.autoSweepKeepBalance) ?? "500";
  const enabled = Boolean(body.enabled);
  const autoSweep = Boolean(body.autoSweepEnabled);
  const authorizationAccepted = Boolean(body.authorizationAccepted);

  if (enabled && !authorizationAccepted) {
    return jsonError(
      "You must accept the Auto-Save authorization text before enabling.",
      400,
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const row = {
      owner_wallet: wallet,
      enabled,
      min_idle_balance: minIdle,
      save_amount: saveAmount,
      frequency,
      auto_sweep_enabled: autoSweep,
      auto_sweep_keep_balance: keepBalance,
      authorization_accepted: authorizationAccepted,
      authorization_note: authorizationAccepted
        ? AUTO_SAVE_AUTHORIZATION_TEXT
        : null,
      usdc_allowance_to: earnAutoSaveExecutorAddress()?.toLowerCase() ?? null,
      next_run_at: enabled
        ? nextRunAtFromFrequency(frequency, now).toISOString()
        : null,
      updated_at: now.toISOString(),
    };

    const { data, error } = await supabase
      .from(rulesTable)
      .upsert(row, { onConflict: "owner_wallet" })
      .select("*")
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return NextResponse.json({
      rule: data,
      authorizationText: AUTO_SAVE_AUTHORIZATION_TEXT,
      executorAddress: earnAutoSaveExecutorAddress(),
      message: enabled
        ? "Auto-Save enabled. Approve USDC to the executor (or confirm pending runs in the app)."
        : "Auto-Save disabled.",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Auto-Save save failed.",
      500,
    );
  }
}
