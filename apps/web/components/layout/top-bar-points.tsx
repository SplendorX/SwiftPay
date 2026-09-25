"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Coins,
  Copy,
  ExternalLink,
  Gift,
  ShoppingCart,
  HelpCircle,
  Loader2,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useSwiftPoints, emitSwiftPointsUpdated } from "@/lib/referral/use-swiftpoints";
import { TierBadge } from "@/components/referral/tier-badge";
import { RedeemModal } from "@/components/referral/redeem-modal";
import { BuyPointsModal } from "@/components/referral/buy-points-modal";
import { GiftPointsModal } from "@/components/referral/gift-points-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TopBarPointsProps {
  className?: string;
}

export function TopBarPoints({ className }: TopBarPointsProps) {
  const {
    points,
    usdcValue,
    tier,
    lifetimeEarned,
    redeemed,
    referralLink,
    activeWallet,
    isConnected,
    isLoading,
    refresh,
  } = useSwiftPoints();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement | null;

      // Buy / Gift / Redeem open in a portal outside this container, so a
      // click inside one of those dialogs is not a click "outside" — without
      // this the popover closes and takes the open dialog with it.
      if (target?.closest?.('[data-slot="dialog-content"], [data-slot="dialog-overlay"]')) {
        return;
      }

      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleCopyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const formattedPoints = points.toLocaleString();
  const canRedeem = points >= 100 && Boolean(activeWallet);

  return (
    <div className={cn("relative shrink-0", className)} ref={containerRef}>
      {/* Top Bar Trigger Button */}
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`SwiftPoints: ${formattedPoints} points (${usdcValue.toFixed(2)} USDC)`}
        className={cn(
          "group relative inline-flex h-11 shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg border px-2.5 sm:px-3 text-xs font-semibold shadow-sm transition-all duration-200 outline-none select-none",
          open
            ? "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/20"
            : "border-amber-500/30 bg-amber-500/10 text-amber-800 hover:border-amber-500/50 hover:bg-amber-500/15 hover:shadow dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20",
        )}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span className="relative flex items-center justify-center">
          <Coins className="h-4 w-4 text-amber-500 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
          {points > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
          ) : null}
        </span>

        <span className="font-bold tabular-nums tracking-tight">
          {formattedPoints}
        </span>
        <span className="hidden xs:inline text-[11px] font-medium opacity-80">
          pts
        </span>

        {/* Subtag with USD equivalent on tablet/desktop */}
        <span className="hidden md:inline-flex items-center rounded-full bg-amber-500/15 dark:bg-amber-500/25 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-500/25">
          ${usdcValue.toFixed(2)}
        </span>
      </button>

      {/* Interactive SwiftPoints Popover Dropdown */}
      {open ? (
        <div
          aria-label="SwiftPoints Rewards"
          className="points-popover rounded-xl border border-border/80 bg-card p-4 text-card-foreground shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150"
          role="dialog"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                <Coins className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold tracking-tight">SwiftPoints</h4>
                <p className="text-[11px] text-muted-foreground">Universal Rewards Balance</p>
              </div>
            </div>
            {isConnected ? (
              <TierBadge tier={tier} />
            ) : (
              <span className="text-[11px] text-muted-foreground">Not connected</span>
            )}
          </div>

          {/* Main Points Card */}
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3.5 dark:bg-amber-500/10">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black tracking-tight text-foreground sm:text-3xl tabular-nums">
                  {formattedPoints}
                </span>
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">SwiftPoints</span>
              </div>
              <div className="text-right">
                <span className="inline-block font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ≈ ${usdcValue.toFixed(2)} USDC
                </span>
                <p className="text-[10px] text-muted-foreground">100 pts = $1.00 USDC</p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-amber-500/20 pt-2.5 text-[11px]">
              <div>
                <span className="text-muted-foreground">Lifetime Earned:</span>
                <p className="font-semibold text-foreground tabular-nums">+{lifetimeEarned.toLocaleString()} pts</p>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground">Redeemed:</span>
                <p className="font-semibold text-foreground tabular-nums">{redeemed.toLocaleString()} pts</p>
              </div>
            </div>
          </div>

          {/* Everyday Cashback Info Tip */}
          <div className="mt-3 rounded-lg border border-border/70 bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Earn <strong>1 to 50 SwiftPoints</strong> cashback on every platform transaction from 20 USDC/EURC up.
            </span>
          </div>

          {/* Actions */}
          <div className="mt-3.5 flex flex-col gap-2">
            {isConnected && activeWallet ? (
              <RedeemModal
                availablePoints={points}
                onSuccess={() => {
                  void refresh();
                  emitSwiftPointsUpdated();
                }}
                trigger={
                  <Button
                    className="w-full font-bold shadow-sm"
                    disabled={!canRedeem}
                    size="sm"
                    variant={canRedeem ? "default" : "secondary"}
                  >
                    <Coins className="mr-1.5 h-3.5 w-3.5" />
                    {canRedeem
                      ? `Redeem for USDC (Min 100 pts)`
                      : `Redeem for USDC (Need ${Math.max(0, 100 - points)} more pts)`}
                  </Button>
                }
                userWallet={activeWallet}
              />
            ) : null}

            {isConnected && activeWallet ? (
              <div className="grid grid-cols-2 gap-2">
                <BuyPointsModal
                  onSuccess={() => {
                    void refresh();
                    emitSwiftPointsUpdated();
                  }}
                  trigger={
                    <Button
                      className="w-full font-semibold"
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                      Buy
                    </Button>
                  }
                  userWallet={activeWallet}
                />
                <GiftPointsModal
                  availablePoints={points}
                  onSuccess={() => {
                    void refresh();
                    emitSwiftPointsUpdated();
                  }}
                  trigger={
                    <Button
                      className="w-full font-semibold"
                      disabled={points < 10}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Gift className="mr-1.5 h-3.5 w-3.5" />
                      Gift
                    </Button>
                  }
                  userWallet={activeWallet}
                />
              </div>
            ) : null}

            <Button
              asChild
              className="w-full justify-between"
              onClick={() => setOpen(false)}
              size="sm"
              variant="outline"
            >
              <Link href="/referral">
                <span className="flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5 text-primary" />
                  <span>Invite Friends &amp; Rewards Hub</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </Button>
          </div>

          {/* Referral Link Quick Copy */}
          {referralLink ? (
            <div className="mt-3 border-t border-border/60 pt-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>Your Referral Link</span>
                <span className="text-[10px] text-primary font-medium">Earn 20-100 pts per referral</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  className="h-8 w-full min-w-0 rounded-md border border-input bg-background/80 px-2 text-[11px] font-mono text-muted-foreground select-all"
                  readOnly
                  value={referralLink}
                />
                <Button
                  className="h-8 shrink-0 px-2.5 text-xs"
                  onClick={handleCopyLink}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only">Copy link</span>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
