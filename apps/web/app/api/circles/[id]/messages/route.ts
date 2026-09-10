import { type NextRequest } from "next/server";

import { jsonCircleError, jsonOk, readActor, readJsonBody } from "@/lib/swift-circle/http";
import {
  deleteMessage,
  listMessages,
  markRead,
  postMessage,
  reportMessage,
} from "@/lib/swift-circle/chat";
import { requireActiveMember } from "@/lib/swift-circle/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const before = request.nextUrl.searchParams.get("before");
    const messages = await listMessages({ circleId: id, before });
    await markRead({
      actorWallet,
      circleId: id,
      messageId: messages.at(-1)?.id ?? null,
    });
    return jsonOk({ messages });
  } catch (error) {
    return jsonCircleError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) return jsonCircleError(new Error("A valid JSON body is required."));
    const { actorWallet } = await readActor(request, body);
    if (body.action === "delete" && typeof body.messageId === "string") {
      await deleteMessage({
        actorWallet,
        circleId: id,
        messageId: body.messageId,
      });
      return jsonOk({ ok: true });
    }
    if (body.action === "report" && typeof body.messageId === "string") {
      await reportMessage({
        actorWallet,
        circleId: id,
        messageId: body.messageId,
        reason: body.reason,
      });
      return jsonOk({ ok: true });
    }
    const message = await postMessage({
      actorWallet,
      circleId: id,
      content: body.content,
      replyToMessageId: body.replyToMessageId,
    });
    return jsonOk({ message }, 201);
  } catch (error) {
    return jsonCircleError(error);
  }
}
