import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { createPayrollGroup, listPayrollGroups } from "@/lib/payroll/group-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const groups = await listPayrollGroups(actorWallet);
    return jsonOk(groups);
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const group = await createPayrollGroup({
      accountId: actorWallet,
      name: String(body.name || ""),
      description: typeof body.description === "string" ? body.description : null,
      defaultSchedule: typeof body.defaultSchedule === "string" ? body.defaultSchedule : null,
      memberIds: Array.isArray(body.memberIds) ? (body.memberIds as string[]) : undefined,
    });

    return jsonOk(group, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
