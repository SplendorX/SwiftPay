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
    const { actorWallet, circleSocialUuid } = await readActor(request, body);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const approved = await approvePayrollRun(
      actorWallet,
      id,
      actorWallet,
      (body?.metadata as Record<string, unknown>) ?? {},
    );
    return jsonOk(approved);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
