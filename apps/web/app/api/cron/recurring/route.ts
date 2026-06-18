import { NextResponse, type NextRequest } from "next/server";

import { processAutopayExecutions } from "@/lib/recurring-autopay";
import { processDueRecurringSchedules } from "@/lib/recurring-service";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return jsonError("Unauthorized cron request.", 401);
  }

  try {
    const [dueResult, autopayResult] = await Promise.all([
      processDueRecurringSchedules(),
      processAutopayExecutions(),
    ]);

    return NextResponse.json({
      autopayAttemptedCount: autopayResult.attemptedCount,
      autopayConfirmedCount: autopayResult.confirmedCount,
      createdCount: dueResult.createdCount,
      scannedCount: dueResult.scannedCount,
      status: "ok",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Recurring cron could not complete.";

    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}