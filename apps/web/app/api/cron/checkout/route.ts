import { NextResponse, type NextRequest } from "next/server";

import { catchUpChargeScans, expireStaleCharges } from "@/lib/checkout/sweep";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Checkout housekeeping: expire stale charges, match card/bank and bridge payments. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    // Scan first: a payment that arrived just before expiry still lands.
    const scans = await catchUpChargeScans();
    const expired = await expireStaleCharges();
    return NextResponse.json({ expired, scans, status: "ok" });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Checkout cron failed.",
        status: "error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
