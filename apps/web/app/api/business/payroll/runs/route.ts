import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { createPayrollRun, listPayrollRuns } from "@/lib/payroll/payroll-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const runs = await listPayrollRuns(actorWallet);
    return jsonOk(runs);
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

    const run = await createPayrollRun(
      {
        accountId: actorWallet,
        name: String(body.name || ""),
        source: body.source === "SCHEDULED" ? "SCHEDULED" : "MANUAL",
        asset: typeof body.asset === "string" ? body.asset : "USDC",
        payrollGroupId: typeof body.payrollGroupId === "string" ? body.payrollGroupId : null,
        payrollScheduleId: typeof body.payrollScheduleId === "string" ? body.payrollScheduleId : null,
        items: Array.isArray(body.items) ? (body.items as any) : [],
      },
      actorWallet,
    );

    return jsonOk(run, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
