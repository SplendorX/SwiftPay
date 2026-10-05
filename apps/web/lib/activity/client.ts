import type {
  AccountActivityEntry,
  ActivityDirection,
  ActivitySource,
} from "@/lib/activity/types";
import type { MonthSummary } from "@/lib/activity/insights";
import { getCircleLoginIdentity, readCircleLogin } from "@/lib/circle-session";

export const accountActivityChangedEventName = "swiftpay:account-activity";

function circleSocialUuid() {
  try {
    return getCircleLoginIdentity(readCircleLogin()).socialUserUUID ?? undefined;
  } catch {
    return undefined;
  }
}

export type RecordAccountActivityClientInput = {
  walletAddress?: string | null;
  source: ActivitySource;
  direction?: ActivityDirection;
  title?: string;
  counterparty?: string | null;
  /** The other party's wallet, when they should see the transfer labelled. */
  counterpartyWallet?: string | null;
  amount?: number | string | null;
  token?: string | null;
  amountIn?: string | null;
  tokenIn?: string | null;
  txHash?: string | null;
  /** BulkPay only: everyone paid, plus the fee and how it was paid. */
  recipients?: Array<{ wallet: string; amount: string; label?: string | null }>;
  fee?: string | null;
  mode?: string | null;
};

/**
 * Label a confirmed transaction with the feature that made it, so the
 * dashboard's Activity board can show where it came from. Never throws: a
 * missing label must not fail a payment that already went through.
 */
export async function recordAccountActivity(
  input: RecordAccountActivityClientInput,
) {
  if (!input.walletAddress) return;

  try {
    const response = await fetch("/api/activity", {
      body: JSON.stringify({
        ...input,
        amount: input.amount == null ? null : String(input.amount).trim(),
        circleSocialUuid: circleSocialUuid(),
      }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (response.ok && typeof window !== "undefined") {
      window.dispatchEvent(new Event(accountActivityChangedEventName));
    }
  } catch {
    /* non-blocking */
  }
}

export async function fetchAccountActivity(ownerWallet: string) {
  const params = new URLSearchParams({ ownerWallet });
  const socialUuid = circleSocialUuid();
  if (socialUuid) params.set("circleSocialUuid", socialUuid);

  const response = await fetch(`/api/activity?${params}`, {
    cache: "no-store",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as {
    entries?: AccountActivityEntry[];
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Activity could not be loaded.");
  }

  return payload?.entries ?? [];
}

/** This month's and last month's money in and out (see /api/activity/insights). */
export async function fetchInsights(ownerWallet: string) {
  const params = new URLSearchParams({ ownerWallet, tz: String(new Date().getTimezoneOffset()) });
  const socialUuid = circleSocialUuid();
  if (socialUuid) params.set("circleSocialUuid", socialUuid);
  const response = await fetch(`/api/activity/insights?${params}`, {
    cache: "no-store",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as
    | { current: MonthSummary; previous: MonthSummary; generatedAt: string; message?: string }
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.message ?? "Insights couldn't be loaded.");
  }
  return payload;
}
