import { type NextRequest } from "next/server";

import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { cancelCharge } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const charge = await cancelCharge({
      chargeId: id,
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    return jsonOk({ charge });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
