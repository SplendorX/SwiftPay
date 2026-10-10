"use client";

import { AlertCircle, Coins, Loader2, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  buyOnePoints,
  fetchPurchaseConfig,
  OnePointsCreditError,
} from "@/lib/referral/points-client";
import { emitOnePointsUpdated } from "@/lib/referral/use-one-points";
import { useSigningWallet } from "@/lib/use-signing-wallet";
import { onchainFacts } from "@/lib/onchain-facts";

const PRESETS = ["1", "5", "10", "25"];

interface BuyPointsModalProps {
  circleSocialUuid?: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  userWallet: string;
}

export function BuyPointsModal({
  circleSocialUuid,
  onSuccess,
  trigger,
  userWallet,
}: BuyPointsModalProps) {
  const wallet = useSigningWallet();
  const [open, setOpen] = useState(false);
  const [usdc, setUsdc] = useState("5");
  const [treasury, setTreasury] = useState<string | null>(null);
  const [pointsPerUsdc, setPointsPerUsdc] = useState(100);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!userWallet) return;
    try {
      const config = await fetchPurchaseConfig({
        circleSocialUuid,
        walletAddress: userWallet,
      });
      setTreasury(config.treasuryAddress);
      setPointsPerUsdc(config.pointsPerUsdc);
      setConfigError(
        config.treasuryAddress
          ? null
          : "Buying points is not configured on this deployment yet.",
      );
    } catch (cause) {
      setConfigError(
        cause instanceof Error ? cause.message : "Could not load pricing.",
      );
    }
  }, [circleSocialUuid, userWallet]);

  useEffect(() => {
    if (open) void loadConfig();
  }, [loadConfig, open]);

  const amount = Number(usdc);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const points = amountValid ? Math.floor(amount * pointsPerUsdc) : 0;
  const canBuy =
    amountValid &&
    points >= 100 &&
    Boolean(treasury) &&
    Boolean(wallet.resolveProvider) &&
    !loading;

  async function handleBuy() {
    if (!canBuy || !treasury || !wallet.resolveProvider) return;
    setLoading(true);

    // Step aside for the wallet's own confirmation.
    //
    // A Circle PIN prompt is an iframe appended to <body>, outside this
    // dialog's portal. While a modal dialog is open Radix locks pointer events
    // on <body> and traps focus inside itself, so the first click on that
    // prompt was being swallowed and only the second one registered. Closing
    // first leaves one confirmation surface on screen instead of two.
    setOpen(false);
    const progress = toast.loading("Confirm the payment in your wallet…");

    try {
      const result = await buyOnePoints({
        circleSocialUuid,
        resolveProvider: wallet.resolveProvider,
        treasuryAddress: treasury,
        usdcAmount: usdc,
        walletAddress: userWallet,
      });

      toast.success(`${result.points} OnePoints added`, {
        description: `Paid ${amount.toFixed(2)} USDC on ${onchainFacts.chain.name}.`,
        id: progress,
      });
      emitOnePointsUpdated();
      onSuccess?.();
    } catch (cause) {
      const paid = cause instanceof OnePointsCreditError;
      toast.error(
        cause instanceof Error ? cause.message : "Could not buy points.",
        { duration: paid ? 20000 : 6000, id: progress },
      );
      // Reopen so a declined or failed attempt can be retried without
      // retyping — but never once the payment has already left the wallet,
      // where a retry would pay twice.
      if (!paid) setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <ShoppingCart className="h-4 w-4" />
            Buy points
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy OnePoints</DialogTitle>
          <DialogDescription>
            Pay in USDC on {onchainFacts.chain.name}. Points arrive once the
            payment confirms on chain.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Amount in USDC</span>
            <Input
              inputMode="decimal"
              onChange={(event) => setUsdc(event.target.value)}
              value={usdc}
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                  key={preset}
                  onClick={() => setUsdc(preset)}
                  type="button"
                >
                  ${preset}
                </button>
              ))}
            </div>
          </label>

          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">You receive</span>
              <span className="inline-flex items-center gap-1.5 font-bold tabular-nums">
                <Coins className="h-4 w-4 text-primary" />
                {points.toLocaleString()} points
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {pointsPerUsdc} points per USDC · minimum 100 points
            </p>
          </div>

          {configError ? (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {configError}
            </p>
          ) : null}

          {!wallet.resolveProvider ? (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {wallet.reason ?? "Connect a wallet to pay."}
            </p>
          ) : null}

          <Button
            className="h-11 w-full"
            disabled={!canBuy}
            onClick={() => void handleBuy()}
            type="button"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Pay {amountValid ? amount.toFixed(2) : "—"} USDC
          </Button>

          <p className="text-xs text-muted-foreground">
            The payment is verified on chain before points are credited, so it
            can take a moment. A payment can only ever be credited once.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
