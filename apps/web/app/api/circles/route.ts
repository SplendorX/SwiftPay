import { type NextRequest } from "next/server";

import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { loadPlatformLimits } from "@/lib/swift-circle/limits";
import { createCircle, listCirclesForUser, listInboxInvitations } from "@/lib/swift-circle/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet } = await readActor(request);
    const [circles, inbox, limits] = await Promise.all([
      listCirclesForUser(actorWallet),
      listInboxInvitations(actorWallet),
      loadPlatformLimits(),
    ]);
    return jsonOk({ circles, inbox, limits });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) {
      throw circleErrors.invalid("A valid JSON body is required.");
    }
    const { actorWallet, requestId } = await readActor(request, body);
    const result = await createCircle({
      actorWallet,
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      currency: body.currency,
      inviteUsernames: body.inviteUsernames,
      requestId,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
