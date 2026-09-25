import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { updatePayrollItemAdjustment } from "@/lib/payroll/payroll-service";

export const runtime = "nodejs";

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

    const updated = await updatePayrollItemAdjustment(
      targetAccountId,
      id,
      Array.isArray(body.adjustments) ? (body.adjustments as any) : [],
    );

    return jsonOk(updated);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
