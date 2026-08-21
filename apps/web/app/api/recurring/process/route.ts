import { NextResponse, type NextRequest } from "next/server";

import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import { processDueRecurringSchedulesForOwner } from "@/lib/recurring-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProcessBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/**
 * Authenticated owner process: queue due schedule executions for display.
 * Does not submit Autopay. Autonomous settlement is cron → worker only.
 */
export async function POST(request: NextRequest) {
  let body: ProcessBody;

  try {
    body = (await request.json()) as ProcessBody;
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
    return jsonError("Authorize this wallet before processing payments.", 401);
  }

  try {
    const due = await processDueRecurringSchedulesForOwner(ownerWallet);

    return NextResponse.json({
      // Kept for API compatibility; settlement is client-wallet driven.
      autopay: {
        attemptedCount: 0,
        confirmedCount: 0,
        errors: [] as Array<{ executionId: string; message: string }>,
        scannedCount: 0,
      },
      due,
      ok: true,
      ownerWallet,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process recurring payments.";

    return jsonError(message, 500);
  }
}
