import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor } from "@/lib/business/http";
import { getPayrollDashboardSummary } from "@/lib/payroll/dashboard-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const summary = await getPayrollDashboardSummary(actorWallet);
    return jsonOk(summary);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
