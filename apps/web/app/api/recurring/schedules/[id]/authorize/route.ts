import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import {
  authorizeRecurringSchedule,
  revokeRecurringAuthorization,
} from "@/lib/recurring/authorization";
import { runAutopayTick } from "@/lib/recurring/tick";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import {
  withScheduleDefaults,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";

export const runtime = "nodejs";

const schedulesTable =
  process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";

type AuthorizeBody = {
  action?: unknown;
  authorizationTxHash?: unknown;
  circleSocialUuid?: unknown;
  expiresAt?: unknown;
  maxPaymentAmountUnits?: unknown;
  ownerWallet?: unknown;
  totalLimitUnits?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: AuthorizeBody;

  try {
    body = (await request.json()) as AuthorizeBody;
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
    return jsonError("Authorize this wallet before managing Autopay.", 401);
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

    const schedule = withScheduleDefaults(
      existing.data as RecurringScheduleRecord,
    );

    if (body.action === "revoke") {
      const revoked = await revokeRecurringAuthorization({
        ownerWallet,
        scheduleId: id,
      });
      if ("error" in revoked && revoked.error) {
        return jsonError(revoked.error, 400);
      }
      return NextResponse.json({ schedule: revoked.schedule });
    }

    if (schedule.status !== "active" && schedule.status !== "paused") {
      return jsonError("Only active or paused schedules can authorize Autopay.", 400);
    }

    const result = await authorizeRecurringSchedule({
      authorizationTxHash:
        typeof body.authorizationTxHash === "string"
          ? body.authorizationTxHash
          : null,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
      maxPaymentAmountUnits:
        typeof body.maxPaymentAmountUnits === "string"
          ? body.maxPaymentAmountUnits
          : null,
      ownerWallet,
      schedule,
      totalLimitUnits:
        typeof body.totalLimitUnits === "string" ? body.totalLimitUnits : null,
    });

    if ("error" in result && result.error) {
      return jsonError(result.error, 400);
    }

    // First due occurrence must settle here. Local `next dev` has no Vercel cron.
    try {
      await runAutopayTick({ enqueueLimit: 10, workerLimit: 10 });
    } catch {
      // Background tick / cron will retry.
    }

    return NextResponse.json({ schedule: result.schedule });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Autopay authorization could not be saved.";
    return jsonError(message, 500);
  }
}
