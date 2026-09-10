import { type NextRequest } from "next/server";

import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { respondToInvitation } from "@/lib/swift-circle/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ invitationId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { invitationId } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw circleErrors.invalid("A valid JSON body is required.");
    const { actorWallet, requestId } = await readActor(request, body);
    const action = body.action === "decline" ? "declined" : "accepted";
    if (body.action !== "accept" && body.action !== "decline") {
      throw circleErrors.invalid("Action must be accept or decline.");
    }
    const invitation = await respondToInvitation({
      actorWallet,
      invitationId,
      decision: action,
      requestId,
    });
    return jsonOk({ invitation });
  } catch (error) {
    return jsonCircleError(error);
  }
}
