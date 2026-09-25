import { NextResponse, type NextRequest } from "next/server";

import { processUnattendedDeposits } from "@/lib/earn/auto-deposit-operator";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;


async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processUnattendedDeposits();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Auto-deposit tick failed.",
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
