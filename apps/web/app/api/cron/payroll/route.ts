import { NextResponse, type NextRequest } from "next/server";

import { processScheduledPayrollPayments } from "@/lib/payroll/payroll-operator";
import { processDuePayrollSchedules } from "@/lib/payroll/scheduler-service";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;


async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    // Create first, then settle: a run that becomes due and is already
    // approved can be paid in the same tick.
    const created = await processDuePayrollSchedules();
    const settled = await processScheduledPayrollPayments();
    return NextResponse.json({ created, settled });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payroll schedule tick failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
