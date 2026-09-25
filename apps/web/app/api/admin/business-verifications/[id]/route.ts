import { type NextRequest } from "next/server";

import { isAdminAuthorized } from "@/lib/admin-auth";
import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { decideSubmission } from "@/lib/business/verification-review";

export const runtime = "nodejs";

/** A reviewer's decision: { decision: "APPROVED" | "REJECTED", reason }. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(request)) return jsonError("Unauthorized.", 401);
  const { id } = await context.params;
  const body = await readJsonRecord(request);
  if (!body) return jsonError("A valid JSON body is required.", 400);
  try {
    return jsonOk(
      await decideSubmission({ decision: body.decision, id, reason: body.reason, reviewer: "admin" }),
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save the decision.", 400);
  }
}
