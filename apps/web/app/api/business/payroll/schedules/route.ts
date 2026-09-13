import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { createPayrollSchedule, listPayrollSchedules } from "@/lib/payroll/schedule-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const schedules = await listPayrollSchedules(actorWallet);
    return jsonOk(schedules);
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

    const schedule = await createPayrollSchedule({
      accountId: actorWallet,
      payrollGroupId: typeof body.payrollGroupId === "string" ? body.payrollGroupId : null,
      frequency: body.frequency as any,
      scheduleConfig: body.scheduleConfig as any,
    });

    return jsonOk(schedule, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
