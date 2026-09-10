import { type NextRequest } from "next/server";

import { writeBusinessAudit } from "@/lib/business/audit";
import { businessErrors } from "@/lib/business/errors";
import {
  jsonBusinessError,
  jsonOk,
  readActor,
  readJsonBody,
} from "@/lib/business/http";
import {
  cancelInvitation,
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  updateMemberRole,
} from "@/lib/business/team";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    const [members, invitations] = await Promise.all([
      listMembers({
        circleSocialUuid,
        ownerWallet: actorWallet,
        workspaceId: id,
      }),
      listInvitations({
        circleSocialUuid,
        ownerWallet: actorWallet,
        workspaceId: id,
      }),
    ]);
    return jsonOk({ invitations, members });
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
    const invitation = await inviteMember({
      circleSocialUuid,
      ownerWallet: actorWallet,
      role: body.role,
      username: typeof body.username === "string" ? body.username : "",
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: invitation.id,
      entityType: "invitation",
      eventType: "MEMBER_INVITED",
      metadata: { role: invitation.role, username: invitation.invited_username },
      workspaceId: id,
    });
    return jsonOk({ invitation }, 201);
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

    if (body.action === "cancel" && typeof body.invitationId === "string") {
      await cancelInvitation({
        circleSocialUuid,
        invitationId: body.invitationId,
        ownerWallet: actorWallet,
        workspaceId: id,
      });
      return jsonOk({ ok: true });
    }

    if (typeof body.memberWallet !== "string") {
      throw businessErrors.invalid("Choose a team member.");
    }

    const member = await updateMemberRole({
      circleSocialUuid,
      memberWallet: body.memberWallet,
      ownerWallet: actorWallet,
      role: body.role,
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: member.id,
      entityType: "member",
      eventType: "ROLE_UPDATED",
      metadata: { role: member.role, memberWallet: member.user_wallet },
      workspaceId: id,
    });
    return jsonOk({ member });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw businessErrors.invalid("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    if (typeof body.memberWallet !== "string") {
      throw businessErrors.invalid("Choose a team member.");
    }
    await removeMember({
      circleSocialUuid,
      memberWallet: body.memberWallet,
      ownerWallet: actorWallet,
      workspaceId: id,
    });
    await writeBusinessAudit({
      actorWallet,
      entityId: body.memberWallet,
      entityType: "member",
      eventType: "MEMBER_REMOVED",
      workspaceId: id,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
