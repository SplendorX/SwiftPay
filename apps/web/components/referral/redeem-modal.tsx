"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Coins, Loader2, Wallet } from "lucide-react";
import { isAddress } from "viem";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emitOnePointsUpdated } from "@/lib/referral/use-one-points";

interface RedeemModalProps {
  availablePoints: number;
  userWallet: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export function RedeemModal({
  availablePoints,
  userWallet,
  onSuccess,
  trigger,
}: RedeemModalProps) {
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("100");
  const [destinationWallet, setDestinationWallet] = useState(userWallet);
  const [destinationTouched, setDestinationTouched] = useState(false);

  // The wallet often resolves after this mounts. Without adopting it the field
  // stays empty, which silently disables the submit button.
  useEffect(() => {
    if (!destinationTouched && userWallet) {
      setDestinationWallet(userWallet);
    }
  }, [destinationTouched, userWallet]);
  const [loading, setLoading] = useState(false);

  const parsedPoints = parseInt(amountStr, 10) || 0;
  const usdcValue = (parsedPoints * 0.01).toFixed(2);
  const isValidAmount = parsedPoints >= 100 && parsedPoints <= availablePoints;
  const isValidAddress = isAddress(destinationWallet);
  const canSubmit = isValidAmount && isValidAddress && !loading;
  const disabledReason = loading
    ? null
    : !destinationWallet
      ? "Connect or sign in to a wallet to receive the USDC."
      : !isValidAddress
        ? "Enter a valid destination wallet address."
        : parsedPoints < 100
          ? "The minimum redemption is 100 OnePoints ($1.00)."
          : parsedPoints > availablePoints
            ? `You only have ${availablePoints.toLocaleString()} OnePoints.`
            : null;

  const handleQuickPercent = (pct: number) => {
    const calculated = Math.floor((availablePoints * pct) / 100);
    setAmountStr(String(Math.max(0, calculated)));
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      const res = await fetch("/api/one-points/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: parsedPoints,
          amountPoints: parsedPoints,
          ownerWallet: userWallet,
          destinationWallet: destinationWallet || userWallet,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || json.error || "Failed to submit redemption.");
      }

      toast.success(
        `Successfully requested redemption of ${parsedPoints} OnePoints for ${usdcValue} USDC!`,
      );
      setOpen(false);
      emitOnePointsUpdated();
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Redemption failed.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            disabled={availablePoints < 100}
            className="gap-1.5 font-medium"
          >
            <Coins className="h-4 w-4 text-amber-500" />
            Redeem OnePoints
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-500" />
            Redeem OnePoints for USDC
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Convert your points at fixed rate of 100 OnePoints = $1.00 USDC directly to your wallet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleRedeem} className="space-y-4 pt-2">
          {/* Balance Preview */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3.5 py-2 text-xs">
            <span className="text-muted-foreground">Available to Redeem:</span>
            <span className="font-semibold text-foreground">
              {availablePoints.toLocaleString()} OnePoints (~${(availablePoints * 0.01).toFixed(2)} USDC)
            </span>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="points-input" className="font-medium text-foreground">
                Points to Redeem (Min 100)
              </label>
              <div className="flex gap-1">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleQuickPercent(pct)}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                  >
                    {pct === 100 ? "MAX" : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Input
                id="points-input"
                type="number"
                min={100}
                max={availablePoints}
                step={1}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="pr-20 font-mono text-sm"
                placeholder="100"
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted-foreground">
                Points
              </div>
            </div>
            {parsedPoints < 100 && (
              <p className="text-[11px] text-destructive">
                Minimum redemption threshold is 100 OnePoints.
              </p>
            )}
            {parsedPoints > availablePoints && (
              <p className="text-[11px] text-destructive">
                Amount exceeds your available balance of {availablePoints} points.
              </p>
            )}
          </div>

          {/* Payout preview card */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center justify-between">
            <div className="text-xs">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                You will receive
              </div>
              <div className="text-[11px] text-muted-foreground">Direct on-chain USDC transfer</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {isValidAmount ? usdcValue : "0.00"}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">USDC</div>
            </div>
          </div>

          {/* Destination Wallet */}
          <div className="space-y-1.5">
            <label htmlFor="payout-wallet" className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              Destination Address
            </label>
            <Input
              id="payout-wallet"
              value={destinationWallet}
              onChange={(e) => {
                setDestinationTouched(true);
                setDestinationWallet(e.target.value);
              }}
              className="font-mono text-xs"
              placeholder="0x..."
            />
            {!isValidAddress && destinationWallet.length > 0 && (
              <p className="text-[11px] text-destructive">
                Please enter a valid Ethereum/Base address.
              </p>
            )}
          </div>

          {disabledReason ? (
            <p className="text-[11px] text-muted-foreground">{disabledReason}</p>
          ) : null}

          {/* Submit button */}
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full gap-2 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting Redemption…
              </>
            ) : (
              <>
                Confirm Redemption
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
