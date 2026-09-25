import { type NextRequest } from "next/server";
import { getReferralDashboard } from "@/lib/referral/service";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const ownerWalletParam =
      request.nextUrl.searchParams.get("ownerWallet") ||
      request.nextUrl.searchParams.get("wallet");
    const circleSocialUuid = request.nextUrl.searchParams.get("circleSocialUuid");

    const actorWallet = await requireReferralActorWallet({
      ownerWallet: ownerWalletParam,
      circleSocialUuid,
    });

    const origin = request.nextUrl.origin;
    const dashboard = await getReferralDashboard(actorWallet, origin);

    return jsonOk(dashboard);
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not load referral dashboard.";
    const status = message.includes("required") ? 400 : 500;
    return jsonError(message, status);
  }
}
