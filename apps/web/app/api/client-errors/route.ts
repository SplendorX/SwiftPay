import { type NextRequest } from "next/server";

import { jsonOk, readJsonRecord } from "@/lib/http";

export const runtime = "nodejs";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/**
 * Where a crashed page reports what broke, so it shows up in the server log
 * instead of only on the customer's phone. Never stores anything; logs a
 * bounded summary (no request bodies, cookies or wallet data).
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord(request);
  if (body) {
    console.error(
      "[client-error]",
      JSON.stringify({
        at: new Date().toISOString(),
        digest: text(body.digest, 64),
        message: text(body.message, 500),
        path: text(body.path, 200),
        stack: text(body.stack, 2000),
        userAgent: request.headers.get("user-agent")?.slice(0, 200),
      }),
    );
  }
  return jsonOk({ ok: true });
}
