import { type NextRequest } from "next/server";
import { redeemOnePoints } from "@/lib/referral/redemption-service";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { rewardsV2Enabled } from "@/lib/rewards/config";
import { MINIMUM_REDEMPTION_ONE_POINTS } from "@/lib/referral/types";

export const runtime = "nodejs";

type RedeemBody = {
  points?: unknown;
  amountPoints?: unknown;
  destinationWallet?: unknown;
  ownerWallet?: unknown;
  walletAddress?: unknown;
  circleSocialUuid?: unknown;
};

export async function POST(request: NextRequest) {
  // Rewards v2: points are spent on discounts, not cashed out (REWARDS-PLAN.md).
  if (rewardsV2Enabled()) {
    return jsonError("OnePoints can no longer be redeemed for USDC. Use them for a discount in Rewards.", 410);
  }
  try {
    const body = await readJsonRecord<RedeemBody>(request);
    if (!body) {
      return jsonError("A valid JSON body is required.", 400);
    }

    const actorWallet = await requireReferralActorWallet({
      ownerWallet: body.ownerWallet || body.walletAddress,
      circleSocialUuid: body.circleSocialUuid,
    });

    const rawPoints = body.points ?? body.amountPoints;
    const points = typeof rawPoints === "number" ? rawPoints : Number(rawPoints);
    if (!Number.isFinite(points) || points < MINIMUM_REDEMPTION_ONE_POINTS) {
      return jsonError(
        `Minimum redemption is ${MINIMUM_REDEMPTION_ONE_POINTS} OnePoints (1.00 USDC).`,
        400,
      );
    }

    const destinationWallet =
      typeof body.destinationWallet === "string" && body.destinationWallet.trim()
        ? body.destinationWallet.trim()
        : actorWallet;

    const result = await redeemOnePoints({
      walletAddress: actorWallet,
      points,
      destinationWallet,
    });

    return jsonOk({ redemption: result });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not complete redemption.";
    const status =
      message.includes("Minimum") || message.includes("Insufficient")
        ? 400
        : message.includes("Unauthorized")
          ? 401
          : 500;
    return jsonError(message, status);
  }
}
