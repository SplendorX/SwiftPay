import { type NextRequest } from "next/server";

import { requireActiveMember } from "@/lib/swift-circle/auth";
import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { listPolicies, updatePolicies } from "@/lib/swift-circle/withdrawals";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const policies = await listPolicies(id);
    return jsonOk({ policies });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw circleErrors.invalid("A valid JSON body is required.");
    const { actorWallet, requestId } = await readActor(request, body);
    const policies = await updatePolicies({
      actorWallet,
      circleId: id,
      policies: body.policies,
      requestId,
    });
    return jsonOk({ policies });
  } catch (error) {
    return jsonCircleError(error);
  }
}
