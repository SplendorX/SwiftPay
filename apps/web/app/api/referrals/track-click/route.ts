import { type NextRequest } from "next/server";
import { resolveReferrer, trackReferralClick } from "@/lib/referral/attribution-service";
import { jsonError, jsonOk, readJsonRecord } from "@/lib/http";
import crypto from "node:crypto";

export const runtime = "nodejs";

type TrackClickBody = {
  identifier?: unknown; // username or referral token
  referralToken?: unknown;
  visitorId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonRecord<TrackClickBody>(request);
    const candidate = body?.identifier || body?.referralToken;
    if (!candidate || typeof candidate !== "string" || !candidate.trim()) {
      return jsonError("A valid referral identifier is required.", 400);
    }

    const resolved = await resolveReferrer(candidate.trim());
    if (!resolved) {
      return jsonError("Referral link not found.", 404);
    }

    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const userAgent = request.headers.get("user-agent");
    const referer = request.headers.get("referer");

    await trackReferralClick({
      referralToken: resolved.profile.referral_token,
      referrerWallet: resolved.profile.wallet_address,
      visitorId: typeof body.visitorId === "string" ? body.visitorId.slice(0, 64) : null,
      ipHash,
      userAgent,
      referer,
    });

    return jsonOk({
      referralToken: resolved.profile.referral_token,
      referrerUsername: resolved.username,
      referrerTier: resolved.profile.current_tier,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not track referral visit.";
    return jsonError(message, 500);
  }
}
