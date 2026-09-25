import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { deletePayrollGroup, getPayrollGroup, updatePayrollGroup } from "@/lib/payroll/group-service";

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

    const group = await getPayrollGroup(targetAccountId, id);
    return jsonOk(group);
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

    const updated = await updatePayrollGroup(targetAccountId, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      defaultSchedule: typeof body.defaultSchedule === "string" ? body.defaultSchedule : undefined,
      memberIds: Array.isArray(body.memberIds) ? (body.memberIds as string[]) : undefined,
    });

    return jsonOk(updated);
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function DELETE(
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

    await deletePayrollGroup(targetAccountId, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonBusinessError(error);
  }
}
