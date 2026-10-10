"use client";

import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { TransferProgressOverlay, type CoinSymbol } from "@/components/send/transfer-progress";
import { TokenIcon } from "@/components/token-icon";

export type SuccessPopupRow = {
  label: string;
  value: string;
};

export type SuccessPopupDetail = {
  amount?: string;
  eyebrow?: string;
  explorerUrl?: string;
  rows?: SuccessPopupRow[];
  subtitle?: string;
  title: string;
};

export const successPopupEventName = "saphra:success";

/**
 * Mark a transaction as complete. Plays the moving-coin animation and ends on
 * its receipt (check, amount, rows, ArcScan link, Done). Flows that already
 * show the animation while they run pass these details to their own overlay
 * instead, so it never plays twice.
 */
export function showSuccess(detail: SuccessPopupDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<SuccessPopupDetail>(successPopupEventName, { detail }),
  );
}

function coinFor(detail: SuccessPopupDetail): CoinSymbol {
  return /\bEURC\b|€/.test(`${detail.amount ?? ""} ${detail.subtitle ?? ""}`) ? "EURC" : "USDC";
}

/** Mounted once, app-wide: shows each showSuccess() as the finished animation. */
export function SuccessPopupHost() {
  const [entry, setEntry] = useState<{ detail: SuccessPopupDetail; key: number } | null>(null);

  useEffect(() => {
    function onSuccess(event: Event) {
      const custom = event as CustomEvent<SuccessPopupDetail>;
      if (custom.detail?.title) {
        setEntry({ detail: custom.detail, key: Date.now() });
      }
    }

    window.addEventListener(successPopupEventName, onSuccess);
    return () => window.removeEventListener(successPopupEventName, onSuccess);
  }, []);

  if (!entry) return null;
  const { detail } = entry;
  const coin = coinFor(detail);
  return (
    <TransferProgressOverlay
      active
      coin={coin}
      current={0}
      details={{
        amount: detail.amount,
        eyebrow: detail.eyebrow,
        explorerUrl: detail.explorerUrl,
        rows: detail.rows,
      }}
      doneSubtitle={detail.subtitle}
      doneTitle={detail.title}
      from={<TokenIcon className="h-8 w-8" symbol={coin} />}
      key={entry.key}
      onDone={() => setEntry(null)}
      state="done"
      steps={[detail.eyebrow ?? "Completing"]}
      title="Completing"
      to={<Wallet className="h-6 w-6 text-primary" />}
    />
  );
}
