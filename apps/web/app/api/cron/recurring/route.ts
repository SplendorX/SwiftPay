import { NextResponse, type NextRequest } from "next/server";

import { runAutopayTick } from "@/lib/recurring/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const result = await runAutopayTick();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Recurring cron could not complete.";
    const needsMigration =
      /authorization_status|execution_mode|occurrence_number|does not exist|schema cache/i.test(
        message,
      );

    return jsonError(
      needsMigration
        ? "Apply packages/database/supabase/recurring-schedules.sql before running autonomous Autopay."
        : message,
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
