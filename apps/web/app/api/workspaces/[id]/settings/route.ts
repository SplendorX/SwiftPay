import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { requireWorkspaceContext } from "@/lib/business/auth";
import { updateWorkspaceSettings } from "@/lib/business/profile";
import { loadBusinessDetail } from "@/lib/business/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireWorkspaceContext({
      circleSocialUuid,
      ownerWallet: actorWallet,
      permission: "business.view",
      workspaceId: id,
    });
    const detail = await loadBusinessDetail(id);
    return jsonOk({ settings: detail.settings });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

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
