import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { retryPayrollItem } from "@/lib/payroll/execution-service";

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

    const retried = await retryPayrollItem({
      accountId: actorWallet,
      itemId: id,
      actorId: actorWallet,
      txHash: typeof body?.txHash === "string" ? body.txHash : null,
      transactionId: typeof body?.transactionId === "string" ? body.transactionId : null,
      success: body?.success !== false,
      failureReason: typeof body?.failureReason === "string" ? body.failureReason : null,
    });

    return jsonOk(retried);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
