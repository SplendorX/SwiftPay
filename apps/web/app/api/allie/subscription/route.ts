import { NextResponse, type NextRequest } from "next/server";

import { jsonError, readJsonRecord } from "@/lib/http";
import {
  assertRecurringAccess,
  normalizeOwnerWallet,
} from "@/lib/recurring-auth";
import {
  allieDailyEscalationBudget,
  allieDailyLlmCallBudget,
  allieOverageFeeUsdc,
  allieOveragePoints,
  alliePerPaymentFeeUnits,
  allieProFeeRecipient,
  allieProMonthlyFeeUsdc,
  allieProPricePoints,
  allieProTermDays,
  getAllieTier,
  loadAllieSubscription,
  loadLlmUsageSummary,
  saveAllieSubscription,
  subscribeAllieProWithPoints,
} from "@/lib/allie/monetization";
import { verifyAllieProPayment } from "@/lib/allie/verify-pro-payment";

export const runtime = "nodejs";

const proTermDays = allieProTermDays;

type SubscribeBody = {
  circleSocialUuid?: unknown;
  ownerWallet?: unknown;
  /** "swiftpoints" pays from the SwiftPoints balance; otherwise USDC by txHash. */
  paymentMethod?: unknown;
  txHash?: unknown;
};

function plan() {
  return {
    monthlyFeeUsdc: allieProMonthlyFeeUsdc(),
    /** The same Pro term, paid in SwiftPoints. */
    monthlyFeePoints: allieProPricePoints(),
    termDays: proTermDays,
    dailyCallBudget: allieDailyLlmCallBudget(),
    /** Each call past the daily budget, charged to SwiftPoints. */
    overageFeeUsdc: allieOverageFeeUsdc(),
    overageFeePoints: allieOveragePoints(),
    dailyEscalationBudget: allieDailyEscalationBudget(),
    // The fee Free pays per payment — the same value agent-fees charges, so
    // the plan card can never quote a number the payment card contradicts.
    perPaymentFeeUnits: alliePerPaymentFeeUnits().toString(),
    feeRecipient: allieProFeeRecipient(),
  };
}

export async function GET(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (!(await assertRecurringAccess({ circleSocialUuid, ownerWallet }))) {
    return jsonError("Authorize this wallet before loading your plan.", 401);
  }

  try {
    const [tier, subscription, usage] = await Promise.all([
      getAllieTier(ownerWallet),
      loadAllieSubscription(ownerWallet),
      loadLlmUsageSummary(ownerWallet).catch(() => ({
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costEstimateUsdc: 0,
      })),
    ]);

    return NextResponse.json({
      plan: plan(),
      subscription,
      tier,
      usageToday: usage,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Your plan could not be loaded.",
      500,
    );
  }
}

/**
 * Activates ALLIE Pro for a 30-day term.
 *
 * The monthly fee is paid on-chain by the user before this is called. The
 * payment is checked on Arc before Pro is granted: a successful USDC transfer
 * of at least the fee, from this wallet to the Pro fee recipient, made in the
 * last two hours and after the wallet's previous activation (so an old
 * payment cannot be replayed). Or pay with SwiftPoints (paymentMethod).
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord<SubscribeBody>(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  const ownerWallet = normalizeOwnerWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (
    !(await assertRecurringAccess({
      circleSocialUuid: body.circleSocialUuid,
      ownerWallet,
    }))
  ) {
    return jsonError("Only the owner can change this plan.", 401);
  }

  // Paying with SwiftPoints: the debit itself is the proof of payment.
  if (body.paymentMethod === "swiftpoints") {
    try {
      const paid = await subscribeAllieProWithPoints(ownerWallet);
      return NextResponse.json({
        plan: plan(),
        subscription: paid.subscription,
        tier: "pro",
        paidPoints: paid.pricePoints,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return /insufficient swiftpoints/i.test(message)
        ? jsonError(
            `ALLIE Pro costs ${allieProPricePoints()} SwiftPoints and your balance is too low.`,
            402,
          )
        : jsonError(message || "ALLIE Pro could not be activated.", 500);
    }
  }

  const txHash =
    typeof body.txHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(body.txHash)
      ? body.txHash
      : null;

  if (!txHash) {
    return jsonError("A payment transaction hash is required.", 400);
  }

  const check = await verifyAllieProPayment({
    feeRecipient: allieProFeeRecipient(),
    feeUsdc: allieProMonthlyFeeUsdc(),
    ownerWallet,
    txHash,
  });
  if (!check.ok) {
    // 503 tells the client to keep the payment for a retry; 422 is final.
    return jsonError(check.reason, check.retryable ? 503 : 422);
  }

  try {
    const current = await loadAllieSubscription(ownerWallet);
    // Each payment activates Pro once: one made before the last activation
    // has already been used.
    if (
      current?.subscribedAt &&
      new Date(current.subscribedAt).getTime() >= check.paidAt.getTime()
    ) {
      return jsonError("That payment has already been used to activate Pro.", 409);
    }

    // A renewal while Pro is active extends from the current expiry.
    const activeUntil =
      current?.tier === "pro" && current.expiresAt
        ? new Date(current.expiresAt).getTime()
        : 0;
    const expiresAt = new Date(
      Math.max(activeUntil, Date.now()) + proTermDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    await saveAllieSubscription({
      ownerWallet,
      tier: "pro",
      expiresAt,
      recurringScheduleId: null,
    });

    return NextResponse.json({
      plan: plan(),
      subscription: await loadAllieSubscription(ownerWallet),
      tier: "pro",
      txHash,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "ALLIE Pro could not be activated.",
      500,
    );
  }
}

/** Downgrade to free — only once no paid Pro time remains (it never renews). */
export async function DELETE(request: NextRequest) {
  const ownerWallet = normalizeOwnerWallet(
    request.nextUrl.searchParams.get("ownerWallet"),
  );
  const circleSocialUuid =
    request.nextUrl.searchParams.get("circleSocialUuid") ?? undefined;

  if (!ownerWallet) {
    return jsonError("A valid owner wallet is required.", 400);
  }

  if (!(await assertRecurringAccess({ circleSocialUuid, ownerWallet }))) {
    return jsonError("Only the owner can change this plan.", 401);
  }

  try {
    // Pro is a prepaid term that never renews: ending it early only forfeits
    // what was paid for, so refuse while any of it remains.
    const current = await loadAllieSubscription(ownerWallet);
    if (
      current?.tier === "pro" &&
      (!current.expiresAt || new Date(current.expiresAt).getTime() > Date.now())
    ) {
      return jsonError(
        "Your Pro term is prepaid and doesn't renew — it returns to Free on its own when it ends.",
        409,
      );
    }

    await saveAllieSubscription({ ownerWallet, tier: "free", expiresAt: null });
    return NextResponse.json({ tier: "free" });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Plan could not be changed.",
      500,
    );
  }
}
