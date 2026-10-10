import { type NextRequest } from "next/server";
import { listUserRedemptions } from "@/lib/referral/redemption-service";
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

    const redemptions = await listUserRedemptions(actorWallet);
    return jsonOk({ redemptions });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not load redemptions.";
    const status = message.includes("required") ? 400 : 500;
    return jsonError(message, status);
  }
}
