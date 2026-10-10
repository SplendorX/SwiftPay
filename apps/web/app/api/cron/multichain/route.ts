import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/cron-auth";
import { multichainEnabled } from "@/lib/multichain/flag";
import { advanceBurnedTransfers } from "@/lib/multichain/send-service";
import { processDue } from "@/lib/multichain/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Backstop for multichain: resumes open sweeps, checks recently active
 * deposit addresses and settles sends to other networks, in case a webhook
 * never came. Vercel Cron runs it daily; an external scheduler can call it
 * every minute with x-cron-secret.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized cron request." }, { status: 401 });
  }
  if (!multichainEnabled) {
    return NextResponse.json({ status: "disabled" });
  }

  try {
    const results = await processDue();
    const sends = await advanceBurnedTransfers();
    return NextResponse.json({
      checked: results.length,
      failed: results.filter((result) => !result.ok),
      sends,
      status: "ok",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Multichain cron failed.",
        status: "error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
