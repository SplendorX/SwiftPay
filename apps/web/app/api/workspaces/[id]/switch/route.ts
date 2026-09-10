import { type NextRequest } from "next/server";

import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { setDefaultWorkspace } from "@/lib/business/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const workspace = await setDefaultWorkspace({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId: id,
    });
    return jsonOk({ workspace });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
