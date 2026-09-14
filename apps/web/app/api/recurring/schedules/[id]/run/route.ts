import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import { createManualExecutionForSchedule } from "@/lib/recurring-service";
import type { RecurringScheduleRecord } from "@/lib/recurring-utils";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const schedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";

type RunScheduleBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * Manual execution path. Creates an awaiting occurrence for the connected
 * wallet to confirm. Autonomous Autopay never uses this endpoint.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: RunScheduleBody;

  try {
    body = (await request.json()) as RunScheduleBody;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
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
    return jsonError("Authorize this wallet before running schedules.", 401);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const existing = await supabase
      .from(schedulesTable)
      .select("*")
      .eq("id", id)
      .eq("owner_wallet", ownerWallet)
      .maybeSingle();

    if (existing.error || !existing.data) {
      return jsonError("Schedule not found.", 404);
    }

    if (existing.data.status !== "active" && existing.data.status !== "paused") {
      return jsonError("Only active or paused schedules can be run.", 400);
    }

    const schedule = existing.data as RecurringScheduleRecord;
    const execution = await createManualExecutionForSchedule(schedule);

    return NextResponse.json(
      { autopay: false, execution, mode: "manual" },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Schedule could not be run.";

    return jsonError(message, 500);
  }
}
