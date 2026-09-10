import { type NextRequest } from "next/server";

import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import {
  createPaymentIntent,
  getPaymentIntent,
  submitPaymentExecution,
} from "@/lib/swift-circle/payments";
import { circleErrors } from "@/lib/swift-circle/errors";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    const paymentId = request.nextUrl.searchParams.get("paymentId");
    if (!paymentId) throw circleErrors.invalid("Payment id is required.");
    const payment = await getPaymentIntent(paymentId, actorWallet);
    if (payment.circle_id !== id) throw circleErrors.notFound("Payment");
    return jsonOk({ payment });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) return jsonCircleError(new Error("A valid JSON body is required."));
    const { actorWallet, requestId, idempotencyKey } = await readActor(
      request,
      body,
    );
    if (typeof body.paymentId === "string" && body.action === "submit") {
      const payment = await submitPaymentExecution({
        actorWallet,
        paymentId: body.paymentId,
        results: body.results,
        txHash: body.txHash,
        transactionId: body.transactionId,
        requestId,
      });
      return jsonOk({ payment });
    }
    const result = await createPaymentIntent({
      actorWallet,
      circleId: id,
      mode: body.mode,
      total: body.total,
      everyoneAmount: body.everyoneAmount,
      recipients: body.recipients,
      note: body.note,
      idempotencyKey: body.idempotencyKey ?? idempotencyKey,
      requestId,
    });
    return jsonOk(result, result.reused ? 200 : 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
