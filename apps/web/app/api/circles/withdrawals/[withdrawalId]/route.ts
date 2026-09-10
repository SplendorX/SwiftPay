import { type NextRequest } from "next/server";

import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import {
  cancelWithdrawal,
  decideWithdrawal,
  executeWithdrawal,
  getWithdrawal,
} from "@/lib/swift-circle/withdrawals";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ withdrawalId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { withdrawalId } = await context.params;
    const { actorWallet } = await readActor(request);
    const withdrawal = await getWithdrawal(withdrawalId, actorWallet);
    return jsonOk({ withdrawal });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { withdrawalId } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw circleErrors.invalid("A valid JSON body is required.");
    const { actorWallet, requestId } = await readActor(request, body);
    if (body.action === "approve" || body.action === "reject") {
      const withdrawal = await decideWithdrawal({
        actorWallet,
        proposalId: withdrawalId,
        decision: body.action === "approve" ? "approved" : "rejected",
        requestId,
      });
      return jsonOk({ withdrawal });
    }
    if (body.action === "cancel") {
      const withdrawal = await cancelWithdrawal({
        actorWallet,
        proposalId: withdrawalId,
      });
      return jsonOk({ withdrawal });
    }
    if (body.action === "execute") {
      const result = await executeWithdrawal({
        actorWallet,
        proposalId: withdrawalId,
        requestId,
        txHash: body.txHash,
      });
      return jsonOk(result);
    }
    throw circleErrors.invalid("Unknown withdrawal action.");
  } catch (error) {
    return jsonCircleError(error);
  }
}
