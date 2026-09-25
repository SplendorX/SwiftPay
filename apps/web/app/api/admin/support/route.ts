import { type NextRequest } from "next/server";

import { isAdminAuthorized } from "@/lib/admin-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { listQueue, SupportError } from "@/lib/support/tickets";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) return jsonError("Unauthorized.", 401);
  const raw = request.nextUrl.searchParams.get("status");
  const status = raw === "waiting_on_customer" || raw === "resolved" || raw === "all" ? raw : "open";
  try {
    return jsonOk({ tickets: await listQueue(status) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load the queue.", error instanceof SupportError ? error.status : 500);
  }
}
