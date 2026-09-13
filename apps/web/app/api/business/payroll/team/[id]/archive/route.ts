import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor } from "@/lib/business/http";
import { archiveTeamMember } from "@/lib/payroll/team-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const archived = await archiveTeamMember(actorWallet, id);
    return jsonOk(archived);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
