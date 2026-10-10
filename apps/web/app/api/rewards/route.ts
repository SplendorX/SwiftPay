import { type NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/http";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import { rewardsV2Enabled } from "@/lib/rewards/config";
import { loadRewardsOverview } from "@/lib/rewards/overview";

export const runtime = "nodejs";

/** The Rewards page: balance, this month's tiers, streak, activity, quests. */
export async function GET(request: NextRequest) {
  if (!rewardsV2Enabled()) return jsonError("Rewards aren't available yet.", 404);
  try {
    const wallet = await requireReferralActorWallet({
      circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
      ownerWallet: request.nextUrl.searchParams.get("ownerWallet"),
    });
    return jsonOk(await loadRewardsOverview(wallet));
  } catch (error) {
    if (error instanceof ReferralAuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "Could not load rewards.", 500);
  }
}
