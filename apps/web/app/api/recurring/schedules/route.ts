import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import {
  isArcTokenSymbol,
  isRecurringFrequency,
  normalizeRecurringAmount,
  type RecurringWalletMode,
} from "@/lib/recurring-utils";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const schedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";

type CreateScheduleBody = {
  amount?: unknown;
  autopayEnabled?: unknown;
  beneficiaryLabel?: unknown;
  beneficiaryUsername?: unknown;
  beneficiaryWallet?: unknown;
  circleSocialUuid?: unknown;
  endsAt?: unknown;
  frequency?: unknown;
  intervalDays?: unknown;
  maxRuns?: unknown;
  narration?: unknown;
  ownerWallet?: unknown;
  startsAt?: unknown;
  tokenSymbol?: unknown;
  walletMode?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function readSupabaseError(error: { message?: string } | null) {
  const message = error?.message ?? "";

  if (message.toLowerCase().includes("permission denied")) {
    return "Supabase rejected access to recurring tables. Run packages/database/supabase/recurring-schedules.sql.";
  }

  if (message.toLowerCase().includes("does not exist")) {
    return "Create recurring tables with packages/database/supabase/recurring-schedules.sql.";
  }

  return message || "SwiftRecurepay could not save this schedule.";
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= maxLength ? text : null;
}

function normalizeWallet(value: unknown) {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }

  return getAddress(value).toLowerCase();
}

function normalizeWalletMode(value: unknown): RecurringWalletMode | null {
  return value === "circle" || value === "external" ? value : null;
}

function normalizeOptionalIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizePositiveInt(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const parsed = Number(value);
      return parsed > 0 ? parsed : null;
    }

    return null;
  }

  return value;
}

export async function GET(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before loading schedules.", 401);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(schedulesTable)
      .select("*")
      .eq("owner_wallet", ownerWallet)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return jsonError(readSupabaseError(error), 500);
    }

    return NextResponse.json({ schedules: data ?? [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Schedules could not be loaded.";

    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  let body: CreateScheduleBody;

  try {
    body = (await request.json()) as CreateScheduleBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);
  const beneficiaryWallet = normalizeWallet(body.beneficiaryWallet);
  const walletMode = normalizeWalletMode(body.walletMode);
  const frequency =
    typeof body.frequency === "string" && isRecurringFrequency(body.frequency)
      ? body.frequency
      : null;
  const tokenSymbol =
    typeof body.tokenSymbol === "string" && isArcTokenSymbol(body.tokenSymbol)
      ? body.tokenSymbol
      : null;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before creating schedules.", 401);
  }

  if (!beneficiaryWallet) {
    return jsonError("A valid beneficiary wallet is required.", 400);
  }

  if (!walletMode) {
    return jsonError("walletMode must be circle or external.", 400);
  }

  if (!frequency) {
    return jsonError("A valid frequency is required.", 400);
  }

  if (!tokenSymbol) {
    return jsonError("A valid token symbol is required.", 400);
  }

  const amount = normalizeRecurringAmount(
    typeof body.amount === "string" ? body.amount : "",
    tokenSymbol,
  );

  if (!amount) {
    return jsonError("Enter a valid payment amount.", 400);
  }

  const intervalDays =
    frequency === "custom" ? normalizePositiveInt(body.intervalDays) : null;

  if (frequency === "custom" && !intervalDays) {
    return jsonError("Custom schedules require a positive intervalDays value.", 400);
  }

  const startsAt =
    normalizeOptionalIsoDate(body.startsAt) ?? new Date().toISOString();
  const endsAt = normalizeOptionalIsoDate(body.endsAt);
  const nextRunAt = new Date(startsAt);

  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    return jsonError("End date must be after the start date.", 400);
  }

  const autopayEnabled =
    body.autopayEnabled === true && walletMode === "external";

  const schedule = {
    amount: amount.amount,
    amount_units: amount.amount_units,
    autopay_enabled: autopayEnabled,
    beneficiary_label: normalizeText(body.beneficiaryLabel, 80),
    beneficiary_username: normalizeText(body.beneficiaryUsername, 20),
    beneficiary_wallet: beneficiaryWallet,
    ends_at: endsAt,
    frequency,
    interval_days: intervalDays,
    max_runs: normalizePositiveInt(body.maxRuns),
    narration: normalizeText(body.narration, 140),
    next_run_at: nextRunAt.toISOString(),
    owner_wallet: ownerWallet,
    starts_at: startsAt,
    status: "active",
    timezone: "UTC",
    token_symbol: tokenSymbol,
    updated_at: new Date().toISOString(),
    wallet_mode: walletMode,
  };

  try {
    const supabase = createSupabaseAdminClient();
    const mutation = await supabase
      .from(schedulesTable)
      .insert(schedule)
      .select("*")
      .single();

    if (mutation.error || !mutation.data) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ schedule: mutation.data }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Schedule could not be created.";

    return jsonError(message, 500);
  }
}