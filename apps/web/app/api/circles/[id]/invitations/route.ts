import { type NextRequest } from "next/server";

import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { loadCircle, requireActiveMember } from "@/lib/swift-circle/auth";
import {
  cancelInvitation,
  inviteMember,
  listCircleInvitations,
} from "@/lib/swift-circle/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const invitations = await listCircleInvitations(id);
    return jsonOk({ invitations });
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
    await loadCircle(id);
    if (body.action === "cancel" && typeof body.invitationId === "string") {
      const invitation = await cancelInvitation({
        actorWallet,
        circleId: id,
        invitationId: body.invitationId,
      });
      return jsonOk({ invitation });
    }
    const invitation = await inviteMember({
      actorWallet,
      circleId: id,
      username: body.username,
      requestId,
    });
    return jsonOk({ invitation }, 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
