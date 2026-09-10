import { type NextRequest } from "next/server";

import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import {
  createPaymentRequest,
  listPaymentRequests,
} from "@/lib/business/payments";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const requests = await listPaymentRequests({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId: id,
    });
    return jsonOk({ requests });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const requestRecord = await createPaymentRequest({
      amount: typeof body.amount === "string" ? body.amount : undefined,
      asset: body.asset,
      circleSocialUuid,
      memo: typeof body.memo === "string" ? body.memo : undefined,
      ownerWallet: actorWallet,
      workspaceId: id,
    });
    return jsonOk({ request: requestRecord }, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
