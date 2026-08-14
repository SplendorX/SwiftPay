"use client";

import type { Address } from "viem";

export type TractionEventInput = {
  amount?: string;
  chainId?: number;
  circleSocialUuid?: string;
  currency?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  source?: string;
  txHash?: string;
  walletAddress?: Address | string | null;
};

const tractionSessionKey = "swiftpay.traction.sessionId";

function getSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(tractionSessionKey);
  if (existing) {
    return existing;
  }

  const next =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(tractionSessionKey, next);

  return next;
}

function compactMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

export function trackTractionEvent(input: TractionEventInput) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    ...input,
    metadata: compactMetadata(input.metadata),
    pathname: window.location.pathname,
    sessionId: getSessionId(),
  };
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/traction/events", blob)) {
        return;
      }
    }

    void fetch("/api/traction/events", {
      body,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  } catch {
    // Telemetry must never break payment UX.
  }
}
