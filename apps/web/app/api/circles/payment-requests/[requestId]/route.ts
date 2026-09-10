import { type NextRequest } from "next/server";

import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import {
  declinePaymentRequest,
  payPaymentRequest,
} from "@/lib/swift-circle/requests";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ requestId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { requestId } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw circleErrors.invalid("A valid JSON body is required.");
    const { actorWallet } = await readActor(request, body);
    if (body.action === "pay") {
      const paymentRequest = await payPaymentRequest({
        actorWallet,
        requestId,
        paymentIntentId:
          typeof body.paymentIntentId === "string" ? body.paymentIntentId : null,
        txHash: typeof body.txHash === "string" ? body.txHash : null,
        transactionId:
          typeof body.transactionId === "string" ? body.transactionId : null,
      });
      return jsonOk({ request: paymentRequest });
    }
    if (body.action === "decline" || body.action === "cancel") {
      const paymentRequest = await declinePaymentRequest({
        actorWallet,
        requestId,
      });
      return jsonOk({ request: paymentRequest });
    }
    throw circleErrors.invalid("Unknown payment request action.");
  } catch (error) {
    return jsonCircleError(error);
  }
}
