import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { approvePayrollRun } from "@/lib/payroll/payroll-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    const targetAccountId = auth.businessWallet || actorWallet;

    const metadata =
      (body?.metadata as Record<string, unknown>) ?? {
        confirmedAt: body?.confirmedAt,
        confirmedBy: body?.confirmedBy,
        balanceVerified: body?.balanceVerified,
      };

    const approved = await approvePayrollRun(
      targetAccountId,
      id,
      actorWallet,
      metadata,
    );
    return jsonOk(approved);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
