import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor } from "@/lib/business/http";
import { reactivateTeamMember } from "@/lib/payroll/team-service";

export const runtime = "nodejs";

export async function POST(
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

    const reactivated = await reactivateTeamMember(targetAccountId, id);
    return jsonOk(reactivated);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
