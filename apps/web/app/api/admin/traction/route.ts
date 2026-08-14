import { NextResponse } from "next/server";

import { getTractionSummary } from "@/lib/traction/service";

export const runtime = "nodejs";

function getAdminSecret() {
  return (
    process.env.TRACTION_ADMIN_SECRET ??
    process.env.EARN_ADMIN_SECRET ??
    process.env.ADMIN_SECRET ??
    ""
  ).trim();
}

function isAuthorized(request: Request) {
  const secret = getAdminSecret();

  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  return token === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { message: "Unauthorized traction dashboard request." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const rangeDays = Number(url.searchParams.get("rangeDays") ?? 30);

  try {
    const summary = await getTractionSummary(rangeDays);
    return NextResponse.json(summary, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Could not load traction summary.",
      },
      { status: 500 },
    );
  }
}
