import { type NextRequest } from "next/server";

import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { normalizeOwnerWallet, requireActiveMember } from "@/lib/swift-circle/auth";
import { changeMemberRole, listMembers } from "@/lib/swift-circle/service";
import { circleErrors } from "@/lib/swift-circle/errors";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const members = await listMembers(id);
    return jsonOk({ members });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) return jsonCircleError(new Error("A valid JSON body is required."));
    const { actorWallet, requestId } = await readActor(request, body);
    const action = body.action;
    if (action !== "promote" && action !== "demote" && action !== "remove") {
      throw circleErrors.invalid("Unknown member action.");
    }
    const targetWallet = normalizeOwnerWallet(body.targetWallet ?? body.userId);
    if (!targetWallet) {
      throw circleErrors.invalid("A valid member wallet is required.");
    }
    const member = await changeMemberRole({
      actorWallet,
      circleId: id,
      targetWallet,
      action,
      requestId,
    });
    return jsonOk({ member });
  } catch (error) {
    return jsonCircleError(error);
  }
}
