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
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const member = await getTeamMember(actorWallet, id);
    const history = await getTeamMemberPaymentHistory(actorWallet, id);

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
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const updated = await updateTeamMember(actorWallet, id, body as any);
    return jsonOk(updated);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
