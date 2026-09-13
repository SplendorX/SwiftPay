import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { executePayrollRun } from "@/lib/payroll/execution-service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const executed = await executePayrollRun({
      accountId: actorWallet,
      payrollRunId: id,
      actorId: actorWallet,
      txHash: typeof body?.txHash === "string" ? body.txHash : null,
      transactionId: typeof body?.transactionId === "string" ? body.transactionId : null,
      availableBalance: typeof body?.availableBalance === "string" ? body.availableBalance : undefined,
      failedItemIds: Array.isArray(body?.failedItemIds) ? (body.failedItemIds as string[]) : undefined,
      itemErrors: (body?.itemErrors as Record<string, string>) || undefined,
    });

    return jsonOk(executed);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
