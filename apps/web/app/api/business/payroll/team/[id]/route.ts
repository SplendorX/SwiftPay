import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { getTeamMember, getTeamMemberPaymentHistory, updateTeamMember } from "@/lib/payroll/team-service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    const targetAccountId = auth.businessWallet || actorWallet;

    const member = await getTeamMember(targetAccountId, id);
    const history = await getTeamMemberPaymentHistory(targetAccountId, id);

    return jsonOk({ member, history });
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    const targetAccountId = auth.businessWallet || actorWallet;

    const updated = await updateTeamMember(targetAccountId, id, body as any);
    return jsonOk(updated);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
