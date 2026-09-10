import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import { acceptInvitation, declineInvitation } from "@/lib/business/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    if (typeof body.invitationId !== "string") {
      throw businessErrors.invalid("Choose an invitation.");
    }
    if (body.action === "decline") {
      await declineInvitation({
        circleSocialUuid,
        invitationId: body.invitationId,
        ownerWallet: actorWallet,
      });
      return jsonOk({ ok: true });
    }
    const invitation = await acceptInvitation({
      circleSocialUuid,
      invitationId: body.invitationId,
      ownerWallet: actorWallet,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: invitation.id,
      entityType: "invitation",
      eventType: "MEMBER_ACCEPTED",
      workspaceId: invitation.workspace_id,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
