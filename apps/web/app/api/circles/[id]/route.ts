import { type NextRequest } from "next/server";

import { circleErrors } from "@/lib/swift-circle/errors";
import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import {
  getCircleDetail,
  leaveCircle,
  setCircleFrozen,
  transferHost,
  updateCircle,
} from "@/lib/swift-circle/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    const detail = await getCircleDetail(id, actorWallet);
    return jsonOk(detail);
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) return jsonCircleError(new Error("A valid JSON body is required."));
    const { actorWallet, requestId } = await readActor(request, body);
    const circle = await updateCircle({
      actorWallet,
      circleId: id,
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      requestId,
    });
    return jsonOk({ circle });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) return jsonCircleError(new Error("A valid JSON body is required."));
    const { actorWallet, requestId } = await readActor(request, body);
    const action = body.action;
    if (action === "freeze" || action === "unfreeze") {
      const circle = await setCircleFrozen({
        actorWallet,
        circleId: id,
        frozen: action === "freeze",
        requestId,
      });
      return jsonOk({ circle });
    }
    if (action === "transfer_host") {
      const circle = await transferHost({
        actorWallet,
        circleId: id,
        newHostWallet: String(body.newHostWallet ?? ""),
        confirm: body.confirm,
        requestId,
      });
      return jsonOk({ circle });
    }
    if (action === "leave") {
      await leaveCircle({ actorWallet, circleId: id, requestId });
      return jsonOk({ ok: true });
    }
    throw circleErrors.invalid("Unknown Circle action.");
  } catch (error) {
    return jsonCircleError(error);
  }
}
