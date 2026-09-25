import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import {
  listEntitlements,
  unlockFeature,
} from "@/lib/referral/entitlement-service";
import { FEATURE_UNLOCK_COST } from "@/lib/referral/types";

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


type UnlockBody = {
  circleSocialUuid?: unknown;
  feature?: unknown;
  ownerWallet?: unknown;
  renew?: unknown;
  walletAddress?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const actorWallet = await requireReferralActorWallet({
      circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
      ownerWallet: request.nextUrl.searchParams.get("wallet"),
    });

    return jsonOk({
      costs: FEATURE_UNLOCK_COST,
      entitlements: await listEntitlements(actorWallet),
    });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message =
      error instanceof Error ? error.message : "Could not load entitlements.";
    return jsonError(message, authStatus(message));
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonRecord<UnlockBody>(request);
    if (!body) {
      return jsonError("A valid JSON body is required.", 400);
    }

    const actorWallet = await requireReferralActorWallet({
      circleSocialUuid: body.circleSocialUuid,
      ownerWallet: body.ownerWallet || body.walletAddress,
    });

    if (
      body.feature !== "EARN_AUTO_DEPOSIT" &&
      body.feature !== "PAYROLL_AUTO_SCHEDULE"
    ) {
      return jsonError("Unknown feature.", 400);
    }

    const result = await unlockFeature({
      feature: body.feature,
      renew: body.renew === true,
      walletAddress: actorWallet,
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not unlock.";
    const status = isAuthMessage(message)
      ? authStatus(message)
      : /SwiftPoints\. You have|needs \d+ SwiftPoints/i.test(message)
        ? 400
        : 500;
    return jsonError(message, status);
  }
}
