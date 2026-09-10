import { type NextRequest } from "next/server";

import { listCircleActivity } from "@/lib/swift-circle/activity";
import { requireActiveMember } from "@/lib/swift-circle/auth";
import { jsonCircleError, jsonOk, readActor } from "@/lib/swift-circle/http";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet } = await readActor(request);
    await requireActiveMember(id, actorWallet);
    const activity = await listCircleActivity(id);
    return jsonOk({ activity });
  } catch (error) {
    return jsonCircleError(error);
  }
}
