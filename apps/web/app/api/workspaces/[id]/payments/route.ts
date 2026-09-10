import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import {
  createOutgoingPayment,
  listPayments,
} from "@/lib/business/payments";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const tab = request.nextUrl.searchParams.get("tab") ?? "all";
    const query = request.nextUrl.searchParams.get("query") ?? undefined;
    const payments = await listPayments({
      circleSocialUuid,
      ownerWallet: actorWallet,
      query,
      tab: tab as
        | "all"
        | "incoming"
        | "outgoing"
        | "pending"
        | "needs_approval",
      workspaceId: id,
    });
    return jsonOk({ payments });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid, idempotencyKey } = await readActor(
      request,
      body,
    );
    const result = await createOutgoingPayment({
      amount: typeof body.amount === "string" ? body.amount : "",
      asset: body.asset,
      circleSocialUuid,
      idempotencyKey,
      memo: typeof body.memo === "string" ? body.memo : undefined,
      ownerWallet: actorWallet,
      recipient: typeof body.recipient === "string" ? body.recipient : "",
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: result.payment.id,
      entityType: "payment",
      eventType: "PAYMENT_CREATED",
      metadata: {
        amount: result.payment.amount_display,
        asset: result.payment.asset,
      },
      workspaceId: id,
    });
    return jsonOk(result, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
