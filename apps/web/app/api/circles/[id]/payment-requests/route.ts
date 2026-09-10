import { type NextRequest } from "next/server";

import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { requireActiveMember } from "@/lib/swift-circle/auth";
import {
  createPaymentRequests,
  listPaymentRequests,
} from "@/lib/swift-circle/requests";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const result = await listPaymentRequests(id);
    return jsonOk(result);
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
    const result = await createPaymentRequests({
      actorWallet,
      circleId: id,
      amount: body.amount,
      targetMode: body.targetMode,
      targetWallets: body.targetWallets,
      reason: body.reason,
      expiresInHours: body.expiresInHours,
      idempotencyKey: body.idempotencyKey ?? idempotencyKey,
      requestId,
    });
    return jsonOk(result, result.reused ? 200 : 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
