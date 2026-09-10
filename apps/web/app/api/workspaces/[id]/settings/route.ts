import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { updateWorkspaceSettings } from "@/lib/business/profile";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    const settings = await updateWorkspaceSettings({
      approvalPolicy: body.approvalPolicy,
      circleSocialUuid,
      maxMembers: body.maxMembers,
      ownerWallet: actorWallet,
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: id,
      entityType: "settings",
      eventType: "SETTINGS_CHANGED",
      workspaceId: id,
    });
    return jsonOk({ settings });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
