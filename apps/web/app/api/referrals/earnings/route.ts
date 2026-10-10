import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import {
  claimReferralEarnings,
  loadReferralEarnings,
  ReferralClaimError,
} from "@/lib/referral/usdc-commission";
import { rewardsV2Enabled } from "@/lib/rewards/config";

export const runtime = "nodejs";

/** Invite & Earn v2: code, tier, referrals and USDC earnings. */
export async function GET(request: NextRequest) {
  if (!rewardsV2Enabled()) return jsonError("Not available yet.", 404);
  try {
    const wallet = await requireReferralActorWallet({
      circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
      ownerWallet: request.nextUrl.searchParams.get("ownerWallet"),
    });
    return jsonOk(await loadReferralEarnings(wallet, request.nextUrl.origin));
  } catch (error) {
    if (error instanceof ReferralAuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "Could not load your earnings.", 500);
  }
}

/** Claim everything accrued (at least the minimum) to the referrer's wallet. */
export async function POST(request: NextRequest) {
  if (!rewardsV2Enabled()) return jsonError("Not available yet.", 404);
  const body = await readJsonRecord(request);
  if (!body) return jsonError("A valid JSON body is required.", 400);
  try {
    const wallet = await requireReferralActorWallet({
      circleSocialUuid: body.circleSocialUuid,
      ownerWallet: body.ownerWallet,
    });
    if (!(await consumeRateLimit(`referral-claim:${wallet}`, 3, 60))) {
      return jsonError("Too many claims. Try again in a minute.", 429);
    }
    return jsonOk(await claimReferralEarnings(wallet));
  } catch (error) {
    if (error instanceof ReferralAuthError) return jsonError(error.message, error.status);
    if (error instanceof ReferralClaimError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "The claim could not be paid.", 500);
  }
}
