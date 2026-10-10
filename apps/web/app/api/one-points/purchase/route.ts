import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { rewardsV2Enabled } from "@/lib/rewards/config";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import {
  listPurchases,
  POINTS_PER_USDC,
  pointsTreasuryAddress,
  purchaseOnePoints,
} from "@/lib/referral/purchase-service";

export const runtime = "nodejs";

/** Missing credentials are a caller error; only a real rejection is 401. */
function isAuthMessage(message: string) {
  return (
    message.includes("Unauthorized") || message.includes("wallet address is required")
  );
}

function authStatus(message: string) {
  if (message.includes("wallet address is required")) return 400;
  if (message.includes("Unauthorized")) return 401;
  return 500;
}


type PurchaseBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
  txHash?: unknown;
  walletAddress?: unknown;
};

/** Where to pay and at what rate, so the client can build the transfer. */
export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    const actorWallet = await requireReferralActorWallet({
      circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
      ownerWallet: wallet,
    });

    return jsonOk({
      pointsPerUsdc: POINTS_PER_USDC,
      purchases: await listPurchases(actorWallet),
      treasuryAddress: pointsTreasuryAddress(),
    });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not load purchases.";
    return jsonError(message, authStatus(message));
  }
}

export async function POST(request: NextRequest) {
  // Rewards v2: points can't be bought any more (REWARDS-PLAN.md).
  if (rewardsV2Enabled()) return jsonError("OnePoints can no longer be bought. Earn them in Rewards.", 410);
  try {
    const body = await readJsonRecord<PurchaseBody>(request);
    if (!body) {
      return jsonError("A valid JSON body is required.", 400);
    }

    const actorWallet = await requireReferralActorWallet({
      circleSocialUuid: body.circleSocialUuid,
      ownerWallet: body.ownerWallet || body.walletAddress,
    });

    if (typeof body.txHash !== "string" || !body.txHash.trim()) {
      return jsonError("The payment transaction hash is required.", 400);
    }

    const purchase = await purchaseOnePoints({
      txHash: body.txHash.trim(),
      walletAddress: actorWallet,
    });

    return jsonOk({ purchase });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not credit the purchase.";
    const status = isAuthMessage(message)
      ? authStatus(message)
      : /not on Arc yet|reverted|does not contain|smallest purchase|another wallet|valid transaction/i.test(
            message,
          )
        ? 400
        : 500;
    return jsonError(message, status);
  }
}
