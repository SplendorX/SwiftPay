import { type NextRequest } from "next/server";

import { jsonBusinessError, jsonOk, readActor } from "@/lib/business/http";
import { requireRateLimit } from "@/lib/checkout/http";
import { getChargeForOwner } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request);
    await requireRateLimit(`checkout-poll:${actorWallet}`, 60, 60);
    const charge = await getChargeForOwner({
      chargeId: id,
      circleSocialUuid,
      ownerWallet: actorWallet,
      scan: true,
      workspaceId,
    });
    return jsonOk({ charge });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
