import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { createPayrollSchedule, listPayrollSchedules } from "@/lib/payroll/schedule-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });

    const schedules = await listPayrollSchedules(auth.businessWallet || actorWallet);
    return jsonOk(schedules);
  } catch (error) {
    return jsonBusinessError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const auth = await requireBusinessAccount({
      circleSocialUuid,
      ownerWallet: actorWallet,
      workspaceId,
    });
    const targetAccountId = auth.businessWallet || actorWallet;

    const schedule = await createPayrollSchedule({
      accountId: targetAccountId,
      payrollGroupId: typeof body.payrollGroupId === "string" ? body.payrollGroupId : null,
      frequency: body.frequency as any,
      scheduleConfig: body.scheduleConfig as any,
    });

    return jsonOk(schedule, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
