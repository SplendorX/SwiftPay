import { type NextRequest } from "next/server";

import { requireActiveMember } from "@/lib/swift-circle/auth";
import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import { archiveSavePocket, createSavePocket } from "@/lib/swift-circle/pockets";
import {
  confirmSaveContributionById,
  getSaveOverview,
  proposeSaveContribution,
  submitSaveContribution,
  updateSaveGoal,
} from "@/lib/swift-circle/save";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const overview = await getSaveOverview(id);
    return jsonOk(overview);
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw circleErrors.invalid("A valid JSON body is required.");
    const { actorWallet } = await readActor(request, body);
    const account = await updateSaveGoal({
      actorWallet,
      circleId: id,
      goalName: body.goalName,
      targetAmount: body.targetAmount,
      targetDate: body.targetDate,
    });
    return jsonOk({ account });
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
    if (typeof body.contributionId === "string" && body.action === "submit") {
      const contribution = await submitSaveContribution({
        actorWallet,
        contributionId: body.contributionId,
        txHash: body.txHash,
        transactionId: body.transactionId,
      });
      return jsonOk({
        contribution,
        confirmed: contribution.status === "confirmed",
        pendingConfirmation: contribution.status === "submitted",
      });
    }
    if (typeof body.contributionId === "string" && body.action === "confirm") {
      const contribution = await confirmSaveContributionById({
        actorWallet,
        contributionId: body.contributionId,
        txHash: body.txHash,
        transactionId: body.transactionId,
      });
      return jsonOk({
        contribution,
        confirmed: contribution.status === "confirmed",
        pendingConfirmation: contribution.status === "submitted",
      });
    }
    if (body.action === "createPocket") {
      const pocket = await createSavePocket({
        actorWallet,
        circleId: id,
        name: body.name,
        icon: body.icon,
        description: body.description,
        targetAmount: body.targetAmount,
        stopAtTarget: body.stopAtTarget,
        lockKind: body.lockKind,
        lockDays: body.lockDays,
        lockUntil: body.lockUntil,
        requestId,
      });
      return jsonOk({ pocket }, 201);
    }
    if (body.action === "archivePocket" && typeof body.pocketId === "string") {
      const pocket = await archiveSavePocket({
        actorWallet,
        circleId: id,
        pocketId: body.pocketId,
      });
      return jsonOk({ pocket });
    }
    const result = await proposeSaveContribution({
      actorWallet,
      circleId: id,
      amount: body.amount,
      pocketId: body.pocketId,
      idempotencyKey: body.idempotencyKey ?? idempotencyKey,
      requestId,
    });
    return jsonOk(result, result.reused ? 200 : 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
