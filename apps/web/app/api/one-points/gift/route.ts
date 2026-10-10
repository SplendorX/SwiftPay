import { type NextRequest } from "next/server";

import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import { ReferralAuthError, requireReferralActorWallet } from "@/lib/referral/auth";
import {
  giftOnePoints,
  listGifts,
  MINIMUM_GIFT_POINTS,
} from "@/lib/referral/gift-service";

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


type GiftBody = {
  circleSocialUuid?: unknown;
  idempotencyKey?: unknown;
  note?: unknown;
  ownerWallet?: unknown;
  points?: unknown;
  recipientWallet?: unknown;
  walletAddress?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const wallet = request.nextUrl.searchParams.get("wallet");
    const actorWallet = await requireReferralActorWallet({
      circleSocialUuid: request.nextUrl.searchParams.get("circleSocialUuid"),
      ownerWallet: wallet,
    });
    return jsonOk({ gifts: await listGifts(actorWallet) });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not load gifts.";
    return jsonError(message, authStatus(message));
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonRecord<GiftBody>(request);
    if (!body) {
      return jsonError("A valid JSON body is required.", 400);
    }

    const actorWallet = await requireReferralActorWallet({
      circleSocialUuid: body.circleSocialUuid,
      ownerWallet: body.ownerWallet || body.walletAddress,
    });

    const points = Number(body.points);
    if (!Number.isFinite(points) || points < MINIMUM_GIFT_POINTS) {
      return jsonError(
        `The smallest gift is ${MINIMUM_GIFT_POINTS} OnePoints.`,
        400,
      );
    }

    if (typeof body.recipientWallet !== "string" || !body.recipientWallet.trim()) {
      return jsonError("A recipient wallet is required.", 400);
    }

    const gift = await giftOnePoints({
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      points,
      recipientWallet: body.recipientWallet.trim(),
      senderWallet: actorWallet,
    });

    return jsonOk({ gift });
  } catch (error) {
    if (error instanceof ReferralAuthError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : "Could not send the gift.";
    const status = isAuthMessage(message)
      ? authStatus(message)
      : /smallest gift|yourself|available|profile yet/i.test(message)
        ? 400
        : 500;
    return jsonError(message, status);
  }
}
