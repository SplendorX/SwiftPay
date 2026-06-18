import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import {
  isArcTokenSymbol,
  isRecurringFrequency,
  isRecurringScheduleStatus,
  normalizeRecurringAmount,
} from "@/lib/recurring-utils";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const schedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";

type UpdateScheduleBody = {
  amount?: unknown;
  autopayEnabled?: unknown;
  circleSocialUuid?: unknown;
  frequency?: unknown;
  intervalDays?: unknown;
  narration?: unknown;
  ownerWallet?: unknown;
  status?: unknown;
  tokenSymbol?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function readSupabaseError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message || "SwiftRecurepay could not update this schedule.";
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= maxLength ? text : null;
}

async function loadOwnedSchedule(id: string, ownerWallet: string) {
  const supabase = createSupabaseAdminClient();
  const existing = await supabase
    .from(schedulesTable)
    .select("*")
    .eq("id", id)
    .eq("owner_wallet", ownerWallet)
    .maybeSingle();

  if (existing.error) {
    throw new Error(readSupabaseError(existing.error));
  }

  return existing.data;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: UpdateScheduleBody;

  try {
    body = (await request.json()) as UpdateScheduleBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before updating schedules.", 401);
  }

  try {
    const current = await loadOwnedSchedule(id, ownerWallet);

    if (!current) {
      return jsonError("Schedule not found.", 404);
    }

    const updates: Record<string, string | number | boolean | null> = {
      updated_at: new Date().toISOString(),
    };

    if (
      typeof body.status === "string" &&
      isRecurringScheduleStatus(body.status)
    ) {
      updates.status = body.status;
    }

    if (
      typeof body.frequency === "string" &&
      isRecurringFrequency(body.frequency)
    ) {
      updates.frequency = body.frequency;
    }

    if (typeof body.intervalDays === "number" && body.intervalDays > 0) {
      updates.interval_days = body.intervalDays;
    }

    if (typeof body.narration === "string") {
      updates.narration = normalizeText(body.narration, 140);
    }

    if (body.autopayEnabled === true && current.wallet_mode === "external") {
      updates.autopay_enabled = true;
    }

    if (body.autopayEnabled === false) {
      updates.autopay_enabled = false;
    }

    const tokenSymbol =
      typeof body.tokenSymbol === "string" && isArcTokenSymbol(body.tokenSymbol)
        ? body.tokenSymbol
        : current.token_symbol;

    if (typeof body.amount === "string") {
      const amount = normalizeRecurringAmount(body.amount, tokenSymbol);

      if (!amount) {
        return jsonError("Enter a valid payment amount.", 400);
      }

      updates.amount = amount.amount;
      updates.amount_units = amount.amount_units;
      updates.token_symbol = tokenSymbol;
    }

    const supabase = createSupabaseAdminClient();
    const mutation = await supabase
      .from(schedulesTable)
      .update(updates)
      .eq("id", id)
      .eq("owner_wallet", ownerWallet)
      .select("*")
      .single();

    if (mutation.error || !mutation.data) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ schedule: mutation.data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Schedule could not be updated.";

    return jsonError(message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
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
    return jsonError("Authorize this wallet before deleting schedules.", 401);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const mutation = await supabase
      .from(schedulesTable)
      .delete()
      .eq("id", id)
      .eq("owner_wallet", ownerWallet);

    if (mutation.error) {
      return jsonError(readSupabaseError(mutation.error), 500);
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Schedule could not be deleted.";

    return jsonError(message, 500);
  }
}