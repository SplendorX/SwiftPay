import { type NextRequest } from "next/server";
import { requireBusinessAccount } from "@/lib/account/auth";
import { jsonBusinessError, jsonOk, readActor, readJsonBody } from "@/lib/business/http";
import { createTeamMember, listTeamMembers } from "@/lib/payroll/team-service";
import type { TeamMemberStatus } from "@/lib/payroll/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { actorWallet, circleSocialUuid } = await readActor(request);
    await requireBusinessAccount({ ownerWallet: actorWallet, circleSocialUuid });

    const statusParam = request.nextUrl.searchParams.get("status") as TeamMemberStatus | null;
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const groupId = request.nextUrl.searchParams.get("groupId") || undefined;

    const members = await listTeamMembers(actorWallet, {
      status: statusParam || undefined,
      includeArchived,
      groupId,
    });

    return jsonOk(members);
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

    const member = await createTeamMember({
      accountId: actorWallet,
      memberType: body.memberType === "CONTRACTOR" ? "CONTRACTOR" : "EMPLOYEE",
      fullName: String(body.fullName || ""),
      email: typeof body.email === "string" ? body.email : null,
      role: typeof body.role === "string" ? body.role : null,
      paymentDestinationType:
        body.paymentDestinationType === "EXTERNAL_WALLET" ? "EXTERNAL_WALLET" : "SWIFTPAY_USER",
      swiftpayUsername: typeof body.swiftpayUsername === "string" ? body.swiftpayUsername : null,
      walletAddress: typeof body.walletAddress === "string" ? body.walletAddress : null,
      preferredAsset: typeof body.preferredAsset === "string" ? body.preferredAsset : "USDC",
      defaultPaymentAmount: typeof body.defaultPaymentAmount === "string" ? body.defaultPaymentAmount : "0",
      paymentFrequency: body.paymentFrequency as any,
    });

    return jsonOk(member, 201);
  } catch (error) {
    return jsonBusinessError(error);
  }
}
