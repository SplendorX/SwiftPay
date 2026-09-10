import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { decidePayment, getPayment } from "@/lib/business/payments";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; paymentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id, paymentId } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const result = await getPayment({
      circleSocialUuid,
      ownerWallet: actorWallet,
      paymentId,
      workspaceId: id,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id, paymentId } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") {
      throw businessErrors.invalid("Choose approve or reject.");
    }
    const payment = await decidePayment({
      circleSocialUuid,
      comment: typeof body.comment === "string" ? body.comment : undefined,
      decision,
      ownerWallet: actorWallet,
      paymentId,
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: payment.id,
      entityType: "payment",
      eventType: decision === "approved" ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
      workspaceId: id,
    });
    return jsonOk({ payment });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
