import { randomUUID } from "node:crypto";
import type { Address } from "viem";

import { officialArcChainId } from "@/lib/network";

/**
 * A PaymentIntent is the single object every SaphraONE initiator produces.
 * Humans, businesses, and ALLIE all create the same shape — the policy engine
 * and the router decide how (and whether) it settles.
 */
export type PaymentIntentInitiatorType = "human" | "business" | "agent";

export type PaymentIntentAsset = "USDC" | "EURC";

export type PaymentIntentRail =
  | "arc-native"
  | "cctp"
  | "batch"
  | "recurring"
  | "agent-direct";

export type PaymentIntentStatus =
  | "pending"
  | "policy_check"
  | "approved"
  | "rejected"
  | "executing"
  | "submitted"
  | "confirming"
  | "completed"
  | "failed"
  | "cancelled";

export type PaymentIntent = {
  intentId: string;
  initiatorType: PaymentIntentInitiatorType;
  initiatorId: string;
  recipient: string;
  resolvedRecipient?: Address;
  asset: PaymentIntentAsset;
  amountUnits: bigint;
  chainId: number;
  rail?: PaymentIntentRail;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
  status: PaymentIntentStatus;
};

export type CreateIntentParams = {
  initiatorId: string;
  recipient: string;
  resolvedRecipient?: Address;
  asset?: PaymentIntentAsset;
  amountUnits: bigint;
  chainId?: number;
  rail?: PaymentIntentRail;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

/** USDC and EURC are both 6-decimal on Arc. */
export const paymentIntentAssetDecimals = 6;

export function isPaymentIntentAsset(
  value: unknown,
): value is PaymentIntentAsset {
  return value === "USDC" || value === "EURC";
}

export function isPaymentIntentInitiatorType(
  value: unknown,
): value is PaymentIntentInitiatorType {
  return value === "human" || value === "business" || value === "agent";
}

export function isPaymentIntentStatus(
  value: unknown,
): value is PaymentIntentStatus {
  return (
    value === "pending" ||
    value === "policy_check" ||
    value === "approved" ||
    value === "rejected" ||
    value === "executing" ||
    value === "submitted" ||
    value === "confirming" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function newUuid() {
  return randomUUID();
}

/**
 * Convert a human amount ("12.5") into 6-decimal units without float drift.
 * Returns null when the input is not a positive decimal amount.
 */
export function parseAmountUnits(
  value: unknown,
  decimals = paymentIntentAssetDecimals,
): bigint | null {
  const raw =
    typeof value === "number"
      ? Number.isFinite(value)
        ? value.toString()
        : ""
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }

  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > decimals) {
    return null;
  }

  const units = BigInt(whole + fraction.padEnd(decimals, "0"));
  return units > 0n ? units : null;
}

/**
 * Convert a provider's human decimal amount ("10", "10.5") into canonical
 * 6-decimal units, truncating any excess precision rather than rejecting it.
 *
 * Providers report `amount` in human units regardless of the token's own
 * `decimals` — on Arc, native USDC declares 18, which must not be applied to
 * a string that is already decimal.
 */
export function parseDecimalToUnits(
  value: unknown,
  decimals = paymentIntentAssetDecimals,
): bigint {
  const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return 0n;
  }

  const [whole, fraction = ""] = raw.split(".");
  const scaled = fraction.slice(0, decimals).padEnd(decimals, "0");

  return BigInt(whole + scaled);
}

export function formatAmountUnits(
  units: bigint,
  decimals = paymentIntentAssetDecimals,
) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(decimals, "0");
  const trimmed = fraction.replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${trimmed ? `.${trimmed}` : ""}`;
}

/**
 * Deterministic default so retried creates collapse onto one intent.
 * Callers that need stricter dedupe pass their own key.
 */
function defaultIdempotencyKey(
  initiatorType: PaymentIntentInitiatorType,
  params: CreateIntentParams,
) {
  return [
    initiatorType,
    params.initiatorId.toLowerCase(),
    params.recipient.toLowerCase(),
    params.asset ?? "USDC",
    params.amountUnits.toString(),
    newUuid(),
  ].join(":");
}

function baseIntent(
  initiatorType: PaymentIntentInitiatorType,
  params: CreateIntentParams,
): PaymentIntent {
  const chainId = params.chainId ?? officialArcChainId();

  if (!chainId) {
    throw new Error(
      "Arc chain id is not configured. Set NEXT_PUBLIC_ARC_CHAIN_ID.",
    );
  }

  if (params.amountUnits <= 0n) {
    throw new Error("Payment amount must be greater than zero.");
  }

  return {
    intentId: newUuid(),
    initiatorType,
    initiatorId: params.initiatorId,
    recipient: params.recipient,
    resolvedRecipient: params.resolvedRecipient,
    asset: params.asset ?? "USDC",
    amountUnits: params.amountUnits,
    chainId,
    rail: params.rail,
    metadata: params.metadata,
    idempotencyKey:
      params.idempotencyKey ?? defaultIdempotencyKey(initiatorType, params),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
}

export function createPersonalIntent(params: CreateIntentParams) {
  return baseIntent("human", params);
}

export function createBusinessIntent(params: CreateIntentParams) {
  return baseIntent("business", params);
}

/** Used by ALLIE. The agent never executes — it only produces this object. */
export function createAgentIntent(params: CreateIntentParams) {
  return baseIntent("agent", params);
}

export function createIntent(
  initiatorType: PaymentIntentInitiatorType,
  params: CreateIntentParams,
) {
  return baseIntent(initiatorType, params);
}
