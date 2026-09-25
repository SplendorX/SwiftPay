"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { readActivatedExternalProfile } from "@/lib/platform-access";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Check,
  Clock,
  Coins,
  Copy,
  DollarSign,
  Gift,
  History,
  Info,
  Loader2,
  Network,
  RefreshCw,
  Share2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShareModal } from "@/components/referral/share-modal";
import { RedeemModal } from "@/components/referral/redeem-modal";
import { BuyPointsModal } from "@/components/referral/buy-points-modal";
import { GiftPointsModal } from "@/components/referral/gift-points-modal";
import { TierBadge } from "@/components/referral/tier-badge";
import { TierProgressCard } from "@/components/referral/tier-progress-card";
import { ReferralBenefitsTable } from "@/components/referral/referral-benefits-table";
import { ReferralProgressList } from "@/components/referral/referral-progress-list";
import type { ReferralDashboardData, SwiftPointsLedgerEntry } from "@/lib/referral/types";

export default function ReferralPage() {
  const {
    address: platformAddress,
    circleSocialUuid,
    isConnected: isPlatformConnected,
  } = usePlatformWallet();
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const [activatedExternalAddress, setActivatedExternalAddress] = useState("");

  useEffect(() => {
    setActivatedExternalAddress(readActivatedExternalProfile());
  }, []);

  const activeWallet =
    platformAddress ||
    wagmiAddress ||
    (activatedExternalAddress && isAddress(activatedExternalAddress)
      ? activatedExternalAddress
      : undefined);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ReferralDashboardData | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<SwiftPointsLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"referrals" | "ledger" | "ladder">("referrals");
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchDashboard = useCallback(
    async (quiet = false) => {
      if (!activeWallet) {
        setLoading(false);
        return;
      }

      if (!quiet) setLoading(true);
      else setRefreshing(true);

      try {
        const params = new URLSearchParams({ ownerWallet: activeWallet });
        if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);

        const res = await fetch(`/api/referrals/dashboard?${params.toString()}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message || json.error || "Failed to load referral data.");
        }

        const dashboardData = (json.data ?? json) as ReferralDashboardData;
        setData(dashboardData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error loading referrals.";
        if (!quiet) toast.error(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeWallet, circleSocialUuid],
  );

  const fetchLedger = useCallback(async () => {
    if (!activeWallet) return;
    setLedgerLoading(true);
    try {
      const params = new URLSearchParams({
        ownerWallet: activeWallet,
        pageSize: "50",
      });
      if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);

      const res = await fetch(`/api/swiftpoints/ledger?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setLedgerEntries(json.entries || []);
      }
    } catch {
      // quiet fallback
    } finally {
      setLedgerLoading(false);
    }
  }, [activeWallet, circleSocialUuid]);

  useEffect(() => {
    if (activeWallet) {
      void fetchDashboard();
      void fetchLedger();
    } else {
      setLoading(false);
      setData(null);
    }
  }, [activeWallet, fetchDashboard, fetchLedger]);

  const handleCopyLink = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setLinkCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <PlatformChrome
      title="Invite & Earn"
      subtitle="Invite friends & businesses to earn SwiftPoints and ongoing cashback"
      actions={<PlatformProfileControls />}
    >
      <PlatformAccessGate>
        <div className="space-y-6 pb-12">
          {/* Header Banner & Share Hero */}
          <div className="relative overflow-hidden rounded-2xl border bg-card p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Network className="h-3.5 w-3.5" />
                  Universal SwiftPay Referral Network
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                  Earn points & cashback with every friend you invite
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Earn up to <strong>100 SwiftPoints</strong> for personal referrals, up to{" "}
                  <strong>200 SwiftPoints</strong> for businesses, and up to{" "}
                  <strong>1.0 SwiftPoint</strong> ongoing cashback on transactions &gt; $10. Plus, your friends receive{" "}
                  <strong>20 SwiftPoints</strong> on qualified activation across all tiers!
                </p>
              </div>

              {/* Referral Link & Share Box */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[300px]">
                <div className="flex items-center gap-2 rounded-xl border bg-background/80 p-1.5 shadow-sm">
                  <span className="truncate px-2 font-mono text-xs text-muted-foreground select-all">
                    {data?.referralLink ||
                      (activeWallet ? "Generating referral link…" : "Connect wallet to view link")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyLink}
                    disabled={!data?.referralLink}
                    className="shrink-0 gap-1.5 text-xs font-medium"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>

                {data && (
                  <ShareModal
                    referralLink={data.referralLink}
                    referralToken={data.referralToken}
                    trigger={
                      <Button className="w-full gap-2 shadow-sm font-semibold">
                        <Share2 className="h-4 w-4" />
                        Share Invitation
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading referral dashboard…</p>
            </div>
          ) : !activeWallet ? (
            <div className="rounded-2xl border border-dashed p-12 text-center space-y-3">
              <Gift className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-bold text-foreground">Connect your wallet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Connect your account to access your unique referral link, tier progression, and SwiftPoints balance.
              </p>
            </div>
          ) : !data ? (
            <div className="rounded-2xl border border-dashed p-12 text-center space-y-3">
              <Gift className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-bold text-foreground">Unable to load referral data</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Could not load referral dashboard for this wallet. Please check your connection and retry.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchDashboard()}
                className="gap-1.5 mt-2"
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            </div>
          ) : (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Available SwiftPoints */}
                <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Available SwiftPoints
                    </span>
                    <Coins className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-black tracking-tight text-foreground font-mono">
                      {data.swiftPoints.available.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      ≈ {data.swiftPoints.usdcEquivalent.toFixed(2)} USDC (1 pt = 0.01 USDC)
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <RedeemModal
                      availablePoints={data.swiftPoints.available}
                      userWallet={activeWallet || ""}
                      onSuccess={() => {
                        void fetchDashboard(true);
                        void fetchLedger();
                      }}
                    />
                    <BuyPointsModal
                      circleSocialUuid={circleSocialUuid}
                      onSuccess={() => {
                        void fetchDashboard(true);
                        void fetchLedger();
                      }}
                      userWallet={activeWallet || ""}
                    />
                    <GiftPointsModal
                      availablePoints={data.swiftPoints.available}
                      circleSocialUuid={circleSocialUuid}
                      onSuccess={() => {
                        void fetchDashboard(true);
                        void fetchLedger();
                      }}
                      userWallet={activeWallet || ""}
                    />
                  </div>
                </div>

                {/* Lifetime Earned */}
                <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Lifetime Earned
                    </span>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-black tracking-tight text-foreground font-mono">
                      {data.swiftPoints.lifetimeEarned.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Redeemed: {data.swiftPoints.redeemed.toLocaleString()} pts
                    </div>
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground">
                    Pending balance: <strong>{data.swiftPoints.pending} pts</strong>
                  </div>
                </div>

                {/* Successful Referrals */}
                <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Qualified Referrals
                    </span>
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-black tracking-tight text-foreground font-mono">
                      {data.totalSuccessfulReferrals}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {data.successfulPersonalReferrals} Personal • {data.successfulBusinessReferrals} Business
                    </div>
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground">
                    Total invited: <strong>{data.metrics.invited}</strong> accounts
                  </div>
                </div>

                {/* Current Tier */}
                <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Current Tier
                    </span>
                    <Award className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <div className="mt-1">
                      <TierBadge tier={data.currentTier} className="text-xs py-1 px-3" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1.5">
                      Activity cashback:{" "}
                      <strong className="text-foreground">
                        {data.currentTier === "STARTER"
                          ? "0.2 pts / tx > 10 USDC"
                          : data.currentTier === "BUILDER"
                            ? "0.3 pts / tx > 10 USDC"
                            : data.currentTier === "ARCHITECT"
                              ? "0.5 pts / tx > 10 USDC"
                              : "1.0 pt / tx > 10 USDC"}
                      </strong>
                    </div>
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground">
                    Status: <strong className="text-emerald-600 dark:text-emerald-400">Active</strong>
                  </div>
                </div>
              </div>

              {/* Tier Progress Component */}
              <TierProgressCard
                currentTier={data.currentTier}
                totalSuccessfulReferrals={data.totalSuccessfulReferrals}
                tierProgress={data.tierProgress}
              />

              {/* Navigation Tabs */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("referrals")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        activeTab === "referrals"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      Invited Referrals ({data.activity.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("ledger")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        activeTab === "ledger"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      SwiftPoints Ledger ({ledgerEntries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("ladder")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        activeTab === "ladder"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      Tier Ladder & Rules
                    </button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void fetchDashboard(true);
                      void fetchLedger();
                    }}
                    disabled={refreshing}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {/* Tab 1: Referral qualification progress */}
                {activeTab === "referrals" && (
                  <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                    {data.activity.length === 0 ? (
                      <div className="py-16 text-center space-y-3">
                        <Users className="h-9 w-9 text-muted-foreground mx-auto" />
                        <h4 className="text-sm font-semibold text-foreground">No referrals yet</h4>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Share your referral link with friends or business owners to start earning SwiftPoints and cashback.
                        </p>
                        <ShareModal
                          referralLink={data.referralLink}
                          referralToken={data.referralToken}
                          trigger={
                            <Button size="sm" className="gap-1.5 font-medium">
                              <Share2 className="h-3.5 w-3.5" />
                              Share Referral Link
                            </Button>
                          }
                        />
                      </div>
                    ) : (
                      <ReferralProgressList referrals={data.activity} tier={data.currentTier} />
                    )}
                  </div>
                )}

                {/* Tab 2: SwiftPoints Ledger */}
                {activeTab === "ledger" && (
                  <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                    {ledgerLoading ? (
                      <div className="py-12 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                        <p className="text-xs text-muted-foreground mt-2">Loading ledger history…</p>
                      </div>
                    ) : ledgerEntries.length === 0 ? (
                      <div className="py-12 text-center space-y-2">
                        <History className="h-8 w-8 text-muted-foreground mx-auto" />
                        <h4 className="text-sm font-semibold text-foreground">No ledger transactions yet</h4>
                        <p className="text-xs text-muted-foreground">
                          Transactions and point awards will be recorded here in immutable fixed-precision accounting.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                              <th className="py-3 px-4">Event</th>
                              <th className="py-3 px-4">Amount</th>
                              <th className="py-3 px-4">Value (USDC)</th>
                              <th className="py-3 px-4">Description</th>
                              <th className="py-3 px-4">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {ledgerEntries.map((entry) => {
                              const isCredit = entry.display_amount > 0;
                              return (
                                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                                      {isCredit ? (
                                        <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                      ) : (
                                        <ArrowUpRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                      )}
                                      <span className="font-mono text-[11px]">{entry.entry_type}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold">
                                    <span
                                      className={
                                        isCredit
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : "text-amber-600 dark:text-amber-400"
                                      }
                                    >
                                      {isCredit ? `+${entry.display_amount}` : entry.display_amount} pts
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono text-muted-foreground">
                                    {Math.abs(entry.usdc_equivalent).toFixed(2)} USDC
                                  </td>
                                  <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                                    {entry.description || "—"}
                                  </td>
                                  <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                                    {new Date(entry.created_at).toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Tier Ladder & Economics */}
                {activeTab === "ladder" && (
                  <ReferralBenefitsTable currentTier={data.currentTier} />
                )}
              </div>
            </>
          )}
        </div>
      </PlatformAccessGate>
    </PlatformChrome>
  );
}
