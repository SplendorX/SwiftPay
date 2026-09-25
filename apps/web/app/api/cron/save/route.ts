import { NextResponse, type NextRequest } from "next/server";

import {
  readSavingsSupabaseError,
  reconcilePendingSavingsTransactions,
} from "@/lib/save/service";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;


/**
 * Reconciliation worker for Save.
 * Finds pending savings txs, checks chain receipts, confirms or fails,
 * and writes reconciliation alerts. No BullMQ/Redis in this monorepo —
 * uses the same Vercel cron pattern as Earn/Recurring.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { message: "Unauthorized cron request." },
      { status: 401 },
    );
  }

  try {
    const result = await reconcilePendingSavingsTransactions(50);
    return NextResponse.json({
      status: "ok",
      reconcile: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : readSavingsSupabaseError(null, "Save cron failed."),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
