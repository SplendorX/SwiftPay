import { NextResponse, type NextRequest } from "next/server";

import { jsonError, readJsonRecord } from "@/lib/http";
import {
  assertRecurringAccess,
  resolveSessionActorWallet,
} from "@/lib/recurring-auth";

import {
  ensureRouterAllowance,
  executeAgentBatch,
  getAgentWalletBalance,
  isAgentWalletConfigured,
  type AgentBatchLeg,
} from "@/lib/agent-wallet/client";
import { arcTokens } from "@/lib/tokens";
import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";
import { getAllieTier } from "@/lib/allie/monetization";
import {
  computeAgentFees,
  feeLegs,
  serializeFees,
} from "@/lib/allie/agent-fees";
import {
  insertAttempt,
  loadIntentById,
  recordSettlement,
  updateAttemptStatus,
  updateIntentStatus,
} from "@/lib/payment-engine/ledger";
import { formatAmountUnits } from "@/lib/payment-engine/intent";
import { routeIntent } from "@/lib/payment-engine/router";

export const runtime = "nodejs";

/** Reads the legs ALLIE recorded on a batch intent, if this is one. */
function readBatchLegs(
  metadata: Record<string, unknown> | undefined,
): AgentBatchLeg[] | null {
  if (metadata?.kind !== "allie-batch" || !Array.isArray(metadata.legs)) {
    return null;
  }

  const legs: AgentBatchLeg[] = [];

  for (const entry of metadata.legs) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const leg = entry as { address?: unknown; amountUnits?: unknown; label?: unknown };

    if (typeof leg.address !== "string" || typeof leg.amountUnits !== "string") {
      return null;
    }

    try {
      legs.push({
        amountUnits: BigInt(leg.amountUnits),
        label: typeof leg.label === "string" ? leg.label : undefined,
        recipient: leg.address as AgentBatchLeg["recipient"],
      });
    } catch {
      return null;
    }
  }

  return legs.length > 0 ? legs : null;
}

type ExecuteBody = {
  circleSocialUuid?: unknown;
  confirmed?: unknown;
  intentId?: unknown;
  ownerWallet?: unknown;
};

/**
 * The only path that submits a PaymentIntent to the execution engine.
 * It refuses anything the user has not explicitly confirmed, and anything the
 * policy engine has not already marked 'approved'.
 */
export async function POST(request: NextRequest) {
  const body = await readJsonRecord<ExecuteBody>(request);

  if (!body) {
    return jsonError("A valid JSON body is required.", 400);
  }

  // Human approval gate. No auto-execute, ever.
  if (body.confirmed !== true) {
    return jsonError("This payment must be explicitly confirmed.", 400);
  }

  const intentId =
    typeof body.intentId === "string" ? body.intentId.trim() : "";

  if (!intentId) {
    return jsonError("An intentId is required.", 400);
  }

  const ownerWallet = await resolveSessionActorWallet(body.ownerWallet);

  if (!ownerWallet) {
    return jsonError("Sign in before confirming a payment.", 401);
  }

  const canAccess = await assertRecurringAccess({
    circleSocialUuid: body.circleSocialUuid,
    ownerWallet,
  });

  if (!canAccess) {
    return jsonError("Authorize this wallet before confirming a payment.", 401);
  }

  try {
    // 1. Load the intent.
    const intent = await loadIntentById(intentId);

    if (!intent) {
      return jsonError("Payment intent was not found.", 404);
    }

    // 2. It must belong to the authenticated wallet.
    if (intent.initiatorId.toLowerCase() !== ownerWallet.toLowerCase()) {
      return jsonError("This payment intent belongs to another wallet.", 403);
    }

    // 3. Only a policy-approved intent may execute.
    if (intent.status !== "approved") {
      return jsonError(
        `This payment is ${intent.status.replace("_", " ")} and cannot be executed.`,
        409,
      );
    }

    // 4. Ask the router which rail and executor to use.
    const decision = routeIntent(intent, {
      initiatorType: intent.initiatorType,
      walletMode: intent.initiatorType === "agent" ? "agent" : "circle",
    });

    if (decision.rail === "not-yet-available") {
      return jsonError(decision.reason, 501);
    }

    if (decision.executor !== "agent-wallet") {
      // External and Circle user wallets sign in the browser — the server has
      // no keys for them. The client executes those with its own wallet and
      // reports the result back through the ledger.
      return jsonError(
        "This intent must be executed from the wallet that owns it.",
        409,
      );
    }

    const agentWallet = await loadAgentWalletConfig(ownerWallet);

    if (!agentWallet) {
      return jsonError("No agent wallet exists for this wallet.", 404);
    }

    if (agentWallet.status !== "active") {
      return jsonError(`Your agent wallet is ${agentWallet.status}.`, 409);
    }

    if (!isAgentWalletConfigured()) {
      return jsonError("Agent Wallet is not configured on this deployment.", 503);
    }

    const attempt = await insertAttempt({
      intentId: intent.intentId,
      rail: decision.rail,
      executor: decision.executor,
      status: "queued",
    });

    await updateIntentStatus(intent.intentId, "executing", {
      rail: decision.rail,
    });

    // 5. Build every transfer this payment makes: the payment legs, then the
    //    fees. ALLIE settles straight from the Agent Wallet rather than
    //    through the SwiftPaySend router, so nothing splits the amount for
    //    us — each fee has to be its own transfer or it is never collected.
    const paymentLegs: AgentBatchLeg[] = (
      readBatchLegs(intent.metadata) ?? [
        {
          amountUnits: intent.amountUnits,
          label:
            typeof intent.metadata?.recipientLabel === "string"
              ? intent.metadata.recipientLabel
              : undefined,
          recipient: intent.resolvedRecipient as AgentBatchLeg["recipient"],
        },
      ]
    ).map((leg) => ({ ...leg, kind: "payment" as const }));

    if (paymentLegs.some((leg) => !leg.recipient)) {
      return jsonError("This payment has no resolved recipient.", 409);
    }

    const tier = await getAllieTier(ownerWallet);
    const breakdown = computeAgentFees(intent.amountUnits, tier);

    // Check the balance covers payment *and* fees before moving anything.
    // Without this, the payment lands and the fee legs fail for want of dust.
    try {
      const available = await getAgentWalletBalance(
        agentWallet.walletId,
        intent.asset,
      );

      if (available < breakdown.totalDebitUnits) {
        return jsonError(
          `Your Agent Wallet holds ${formatAmountUnits(available)} ${intent.asset}, but this needs ${formatAmountUnits(breakdown.totalDebitUnits)} including fees.`,
          409,
        );
      }
    } catch {
      // A balance lookup failure is not a reason to block a payment the
      // policy engine already approved — Circle will reject it if short.
    }

    // The router pulls with transferFrom, so it needs an allowance first.
    // Checked against the live chain, so a wallet that already approved never
    // pays for a second one.
    try {
      await ensureRouterAllowance({
        required: breakdown.totalDebitUnits,
        token: arcTokens[intent.asset].address,
        walletAddress: agentWallet.walletAddress,
        walletId: agentWallet.walletId,
      });
    } catch (approvalError) {
      await updateAttemptStatus(attempt.attemptId, "failed", {
        errorMessage:
          approvalError instanceof Error ? approvalError.message : undefined,
      });
      await updateIntentStatus(intent.intentId, "failed");

      return jsonError(
        approvalError instanceof Error
          ? approvalError.message
          : "The Agent Wallet could not approve the send router.",
        502,
      );
    }

    const batch = await executeAgentBatch(agentWallet.walletId, intent, [
      ...paymentLegs,
      ...feeLegs(breakdown),
    ]);

    const landed = batch.legs.find((leg) => leg.kind === "payment" && leg.txHash);

    const result = {
      error:
        batch.failed > 0
          ? `${batch.failed} of ${paymentLegs.length} payments failed.`
          : undefined,
      status: batch.status,
      transactionId: landed?.transactionId,
      txHash: landed?.txHash,
    } as const;

    // 6. Record the outcome.
    if (result.status === "failed") {
      await updateAttemptStatus(attempt.attemptId, "failed", {
        errorMessage: result.error,
        providerTransactionId: result.transactionId,
      });
      await updateIntentStatus(intent.intentId, "failed", {
        metadata: {
          ...intent.metadata,
          batch: batch.legs,
          failureReason: result.error,
        },
      });

      // `message` is what the client surfaces — without it the UI falls back
      // to a generic failure and the real cause is lost.
      return NextResponse.json(
        {
          batch,
          intentId: intent.intentId,
          message:
            batch.legs.find((leg) => leg.kind === "payment" && leg.error)
              ?.error ??
            result.error ??
            "The payment could not be submitted.",
          result,
        },
        { status: 502 },
      );
    }

    await updateAttemptStatus(attempt.attemptId, "submitted", {
      txHash: result.txHash,
      providerTransactionId: result.transactionId,
    });

    await updateIntentStatus(intent.intentId, "submitted", {
      metadata: {
        ...intent.metadata,
        batch: batch.legs,
        fees: serializeFees(breakdown),
        // Surfaced rather than swallowed: an uncollected fee is a revenue
        // leak, and it should be visible in the ledger.
        feesFailed: batch.feesFailed,
      },
      rail: decision.rail,
    });

    if (result.txHash) {
      await recordSettlement({
        intentId: intent.intentId,
        attemptId: attempt.attemptId,
        txHash: result.txHash,
        chainId: intent.chainId,
        amountUnits: intent.amountUnits,
        feeUnits: breakdown.totalFeeUnits,
      });
    }

    // 7. Return the execution result.
    return NextResponse.json({
      attemptId: attempt.attemptId,
      batch,
      fees: serializeFees(breakdown),
      intentId: intent.intentId,
      rail: decision.rail,
      result,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "Payment could not be executed.",
      500,
    );
  }
}
