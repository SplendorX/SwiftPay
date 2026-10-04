import { type NextRequest } from "next/server";

import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { requireRateLimit } from "@/lib/checkout/http";
import { reconcileCharge } from "@/lib/checkout/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** The merchant attaches a transfer that the matcher missed. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    await requireRateLimit(`checkout-reconcile:${actorWallet}`, 20, 3600);
    const charge = await reconcileCharge({
      chargeId: id,
      circleSocialUuid,
      ownerWallet: actorWallet,
      txHash: body.txHash,
      workspaceId,
    });
    return jsonOk({ charge });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
