import { type NextRequest } from "next/server";

import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { getVerificationState, submitVerification } from "@/lib/business/verification-review";

export const runtime = "nodejs";

/** The business's verification state: eligibility, ID options, last result. */
export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request);
    const auth = await requireBusinessAccount({ circleSocialUuid, ownerWallet: actorWallet, workspaceId });
    return jsonOk(await getVerificationState(auth.businessWallet || actorWallet));
  } catch (error) {
    return jsonBusinessError(error);
  }
}

/** Submit a registration number or tax ID for review. */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    if (!body) throw new Error("A valid JSON body is required.");
    const { actorWallet, circleSocialUuid, workspaceId } = await readActor(request, body);
    const auth = await requireBusinessAccount({ circleSocialUuid, ownerWallet: actorWallet, workspaceId });
    return jsonOk(
      await submitVerification(auth.businessWallet || actorWallet, {
        idNumber: body.idNumber,
        idType: body.idType,
      }),
    );
  } catch (error) {
    return jsonBusinessError(error);
  }
}
