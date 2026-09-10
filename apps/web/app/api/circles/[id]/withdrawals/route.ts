import { type NextRequest } from "next/server";

import { requireActiveMember } from "@/lib/swift-circle/auth";
import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import {
  createWithdrawalProposal,
  listWithdrawals,
} from "@/lib/swift-circle/withdrawals";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const withdrawals = await listWithdrawals(id);
    return jsonOk({ withdrawals });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw circleErrors.invalid("A valid JSON body is required.");
    const { actorWallet, requestId, idempotencyKey } = await readActor(
      request,
      body,
    );
    const result = await createWithdrawalProposal({
      actorWallet,
      circleId: id,
      productType: body.productType,
      amount: body.amount,
      destinationWallet: body.destinationWallet,
      destinationAddress: body.destinationAddress,
      pocketId: body.pocketId,
      reason: body.reason,
      confirm: body.confirm,
      idempotencyKey: body.idempotencyKey ?? idempotencyKey,
      requestId,
    });
    return jsonOk(result, result.reused ? 200 : 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
