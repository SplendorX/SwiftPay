"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { showSuccess } from "@/components/success-popup";
import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import { arcChain } from "@/lib/chains";
import type { ClaimablePurchase } from "@/lib/rewards/discounts";
import { bottomSheetClassName, useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

function points(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Pick a premium purchase and how much of it to refund with points. */
export function ClaimDiscountSheet({
  balance,
  circleSocialUuid,
  onClaimed,
  onOpenChange,
  open,
  wallet,
}: {
  balance: number;
  circleSocialUuid?: string | null;
  onClaimed: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wallet: string;
}) {
  const side = useSheetSide();
  const [purchases, setPurchases] = useState<ClaimablePurchase[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPurchases(null);
    setSelected(null);
    setPercent(null);
    setError(null);
    const params = new URLSearchParams({ ownerWallet: wallet });
    if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);
    fetch(`/api/rewards/discounts?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as { message?: string; purchases?: ClaimablePurchase[] };
        if (!response.ok) throw new Error(json.message || "Could not load your purchases.");
        setPurchases(json.purchases ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load your purchases."));
  }, [circleSocialUuid, open, wallet]);

  const purchase = purchases?.find((entry) => entry.id === selected) ?? null;
  const option = purchase?.options.find((entry) => entry.percent === percent) ?? null;
  const affordable = option ? option.points <= balance : false;

  async function claim() {
    if (!purchase || !option) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rewards/discounts", {
        body: JSON.stringify({ circleSocialUuid, ownerWallet: wallet, percent: option.percent, purchaseId: purchase.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const json = (await response.json()) as { message?: string; refundUsdc?: number; txHash?: string };
      if (!response.ok) throw new Error(json.message || "The discount could not be claimed.");
      onOpenChange(false);
      onClaimed();
      showSuccess({
        amount: `${(json.refundUsdc ?? option.refundUsdc).toFixed(2)} USDC`,
        eyebrow: "Rewards",
        explorerUrl: json.txHash ? `${arcChain.blockExplorers.default.url}/tx/${json.txHash}` : undefined,
        rows: [
          { label: "Purchase", value: purchase.label },
          { label: "Refunded", value: `${option.percent}%` },
          { label: "Points spent", value: points(option.points) },
        ],
        subtitle: "The refund is in your wallet.",
        title: "Discount claimed",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The discount could not be claimed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={cn("gap-0 p-0", side === "bottom" ? bottomSheetClassName : "w-full sm:max-w-md")}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="rw-sheet">
          <SheetTitle className="rw-sheet-title">Claim a discount</SheetTitle>
          <SheetDescription className="sr-only">Pick a premium purchase and how much to refund</SheetDescription>

          {purchases === null && !error ? (
            <div className="rw-center grid">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : purchases && purchases.length === 0 ? (
            <p className="rw-note">
              No purchases to claim against yet. Your premium purchases (ALLIE Pro, automatic deposits, automatic payroll) show up here.
            </p>
          ) : (
            <>
              <ul className="rw-purchases">
                {(purchases ?? []).map((entry) => (
                  <li key={entry.id}>
                    <button
                      className={cn("rw-purchase", entry.id === selected && "is-selected")}
                      onClick={() => {
                        setSelected(entry.id);
                        setPercent(null);
                      }}
                      type="button"
                    >
                      <span className="min-w-0">
                        <strong>{entry.label}</strong>
                        <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                      </span>
                      <span className="rw-purchase-amount">{entry.amountUsdc.toFixed(2)} USDC</span>
                    </button>
                  </li>
                ))}
              </ul>

              {purchase ? (
                <div className="rw-options">
                  {purchase.options.map((entry) => (
                    <button
                      className={cn("rw-option", entry.percent === percent && "is-selected")}
                      disabled={!entry.eligible}
                      key={entry.percent}
                      onClick={() => setPercent(entry.percent)}
                      type="button"
                    >
                      <strong>{entry.percent}%</strong>
                      <span>{entry.refundUsdc.toFixed(2)} USDC</span>
                      <span>{points(entry.points)} pts</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {option ? (
                <p className="rw-note">
                  Get <strong>{option.refundUsdc.toFixed(2)} USDC</strong> back for{" "}
                  <strong>{points(option.points)} points</strong>. You have {points(balance)}.
                </p>
              ) : null}
            </>
          )}

          {error ? <p className="rw-error">{error}</p> : null}

          <button
            className="rw-pill is-primary is-wide"
            disabled={!option || !affordable || busy}
            onClick={() => void claim()}
            type="button"
          >
            {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : option && !affordable ? "Not enough points" : "Claim discount"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
