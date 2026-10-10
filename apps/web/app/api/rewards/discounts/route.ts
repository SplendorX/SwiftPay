import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import { rewardsV2Enabled } from "@/lib/rewards/config";
import { claimDiscount, DiscountError, listClaimablePurchases } from "@/lib/rewards/discounts";

export const runtime = "nodejs";

/** Premium purchases a discount can still be claimed against. */
export async function GET(request: NextRequest) {
  if (!rewardsV2Enabled()) return jsonError("Rewards aren't available yet.", 404);
  try {
    const wallet = await requireReferralActorWallet({
      circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
      ownerWallet: request.nextUrl.searchParams.get("ownerWallet"),
    });
    return jsonOk({ purchases: await listClaimablePurchases(wallet) });
  } catch (error) {
    if (error instanceof ReferralAuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "Could not load purchases.", 500);
  }
}

/** Spend points for a USDC refund on one purchase. */
export async function POST(request: NextRequest) {
  if (!rewardsV2Enabled()) return jsonError("Rewards aren't available yet.", 404);
  const body = await readJsonRecord(request);
  if (!body) return jsonError("A valid JSON body is required.", 400);
  try {
    const wallet = await requireReferralActorWallet({
      circleSocialUuid: body.circleSocialUuid,
      ownerWallet: body.ownerWallet,
    });
    if (!(await consumeRateLimit(`rewards-discount:${wallet}`, 5, 60))) {
      return jsonError("Too many claims. Try again in a minute.", 429);
    }
    const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    const percent = typeof body.percent === "number" ? body.percent : Number(body.percent);
    if (!purchaseId) return jsonError("Choose a purchase.", 400);
    return jsonOk(await claimDiscount({ percent, purchaseId, walletAddress: wallet }));
  } catch (error) {
    if (error instanceof ReferralAuthError) return jsonError(error.message, error.status);
    if (error instanceof DiscountError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "The discount could not be claimed.", 500);
  }
}
