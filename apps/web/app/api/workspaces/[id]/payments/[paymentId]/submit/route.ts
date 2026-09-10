import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { submitPayment } from "@/lib/business/payments";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id, paymentId } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const payment = await submitPayment({
      circleSocialUuid,
      circleTransactionId:
        typeof body.circleTransactionId === "string"
          ? body.circleTransactionId
          : undefined,
      ownerWallet: actorWallet,
      paymentId,
      txHash: typeof body.txHash === "string" ? body.txHash : undefined,
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: payment.id,
      entityType: "payment",
      eventType: "PAYMENT_SUBMITTED",
      workspaceId: id,
    });
    return jsonOk({ payment });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
