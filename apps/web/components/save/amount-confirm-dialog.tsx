"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoneyShort } from "@/components/save/format";
import type { ArcTokenSymbol } from "@/lib/tokens";

type AmountConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "deposit" | "withdraw";
  pocketName: string;
  currency: ArcTokenSymbol;
  walletBalanceLabel: string;
  pocketBalance: string;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: (amount: string) => void;
  /** Optional fee lines for transparency (shown on deposit). */
  networkFeeLabel?: string;
  platformFeeLabel?: string;
};

export function AmountConfirmDialog({
  open,
  onOpenChange,
  mode,
  pocketName,
  currency,
  walletBalanceLabel,
  pocketBalance,
  isSubmitting,
  error,
  onConfirm,
  networkFeeLabel = "$0.00",
  platformFeeLabel = "$0.00",
}: AmountConfirmDialogProps) {
  const [amount, setAmount] = useState("");

  const preview = useMemo(() => {
    const n = Number(amount);
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) return null;
    const pocket = Number(pocketBalance) || 0;
    if (mode === "deposit") {
      return {
        headline: `You are moving ${formatMoneyShort(amount)} from your available balance into ${pocketName}.`,
        newPocket: formatMoneyShort((pocket + n).toFixed(6).replace(/\.?0+$/, "")),
      };
    }
    return {
      headline: `Move ${formatMoneyShort(amount)} back to your available SwiftPay balance?`,
      newPocket: formatMoneyShort(Math.max(0, pocket - n).toFixed(6).replace(/\.?0+$/, "")),
    };
  }, [amount, mode, pocketBalance, pocketName]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAmount("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "deposit" ? "Add money" : "Withdraw"}
          </DialogTitle>
          <DialogDescription>
            {mode === "deposit"
              ? `Fund ${pocketName} from your spendable ${currency} balance.`
              : `Return funds from ${pocketName} to your spendable balance.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <span>Wallet balance</span>
              <span className="font-medium text-foreground">
                {walletBalanceLabel}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span>Pocket balance</span>
              <span className="font-medium text-foreground">
                {formatMoneyShort(pocketBalance)} {currency}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Amount ({currency})
            </label>
            <Input
              disabled={isSubmitting}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50"
              value={amount}
            />
          </div>

          {preview ? (
            <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
              <p>{preview.headline}</p>
              <p className="text-xs text-muted-foreground">
                New pocket balance: {preview.newPocket} {currency}
              </p>
              {mode === "deposit" ? (
                <div className="space-y-1 border-t border-primary/10 pt-2 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>Amount to save</span>
                    <span className="font-medium text-foreground">
                      {formatMoneyShort(amount)} {currency}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Network fee</span>
                    <span>{networkFeeLabel}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Platform fee</span>
                    <span>{platformFeeLabel}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isSubmitting || !preview}
            onClick={() => onConfirm(amount.trim())}
            type="button"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : mode === "deposit" ? (
              `Save ${amount.trim() ? formatMoneyShort(amount) : ""}`.trim()
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
