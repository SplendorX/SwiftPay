"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useReadContract } from "wagmi";

import { useAccountContext } from "@/components/account/account-provider";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { fetchBusinessOverview } from "@/lib/account/client";
import { profileCompletionPercent } from "@/lib/account/money";
import type { InvoiceRecord, InvoiceSummary } from "@/lib/account/types";
import { fetchPayrollDashboard } from "@/lib/payroll/client";
import type { PayrollDashboardSummary } from "@/lib/payroll/types";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { erc20Abi } from "@/lib/contracts";
import { arcTestnetTokens } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";
import type { WalletTransfer } from "@/lib/arcscan-history";

import { BusinessPageHeader } from "@/components/business/overview/business-page-header";
import { BusinessBalanceCard } from "@/components/business/overview/business-balance-card";
import { BusinessQuickActions } from "@/components/business/overview/business-quick-actions";
import { BusinessMetricsGrid } from "@/components/business/overview/business-metrics-grid";
import { CashFlowCard } from "@/components/business/overview/cash-flow-card";
import { BusinessActivityCard } from "@/components/business/overview/business-activity-card";
import { BusinessInsightsCard } from "@/components/business/overview/business-insights-card";
import { InvoiceOverviewCard } from "@/components/business/overview/invoice-overview-card";
import { TeamPaymentsCard } from "@/components/business/overview/team-payments-card";
import { BusinessHealthCard } from "@/components/business/overview/business-health-card";
import { BusinessOverviewSkeleton } from "@/components/business/overview/business-overview-skeleton";
import {
  buildRealOverviewData,
  computeRealCashFlow,
} from "@/components/business/overview/overview-data";

export function BusinessOverview() {
  const t = useT();
  const { account, loading: accountLoading, ownerWallet, profile } = useAccountContext();
  const { address } = usePlatformWallet();

  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<PayrollDashboardSummary | null>(null);
  const [transfers, setTransfers] = useState<WalletTransfer[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch live database records (Invoices & Payroll)
  useEffect(() => {
    if (!ownerWallet) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    let isMounted = true;

    Promise.allSettled([
      fetchBusinessOverview(ownerWallet),
      fetchPayrollDashboard(ownerWallet),
    ])
      .then(([overviewResult, payrollResult]) => {
        if (!isMounted) return;

        if (overviewResult.status === "fulfilled") {
          setSummary(overviewResult.value.summary);
          setInvoices(overviewResult.value.invoices);
        } else {
          setError("Could not load full business overview.");
        }

        if (payrollResult.status === "fulfilled") {
          setPayrollSummary(payrollResult.value);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ownerWallet]);

  // 2. Fetch real on-chain transfer history from ArcScan for active business wallet
  useEffect(() => {
    const targetAddress = address || ownerWallet;
    if (!targetAddress || !isAddress(targetAddress)) {
      setTransfers([]);
      return;
    }

    let isMounted = true;
    fetch(`/api/arcscan/history?address=${targetAddress}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { items?: WalletTransfer[] }) => {
        if (isMounted && Array.isArray(data.items)) {
          setTransfers(data.items);
        }
      })
      .catch(() => {
        if (isMounted) setTransfers([]);
      });

    return () => {
      isMounted = false;
    };
  }, [address, ownerWallet]);

  // 3. Read real on-chain token balances on Arc Testnet
  const activeAddress = (address || ownerWallet) as `0x${string}` | undefined;
  const isAddressValid = Boolean(activeAddress && isAddress(activeAddress));

  const { data: rawUsdcBalance } = useReadContract({
    address: arcTestnetTokens.USDC.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: isAddressValid ? [activeAddress!] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: isAddressValid },
  });

  const { data: rawEurcBalance } = useReadContract({
    address: arcTestnetTokens.EURC.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: isAddressValid ? [activeAddress!] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: isAddressValid },
  });

  const usdcBalance = useMemo(() => {
    if (typeof rawUsdcBalance === "bigint") {
      return parseFloat(formatUnits(rawUsdcBalance, arcTestnetTokens.USDC.decimals)) || 0;
    }
    return 0;
  }, [rawUsdcBalance]);

  const eurcBalance = useMemo(() => {
    if (typeof rawEurcBalance === "bigint") {
      return parseFloat(formatUnits(rawEurcBalance, arcTestnetTokens.EURC.decimals)) || 0;
    }
    return 0;
  }, [rawEurcBalance]);

  if (accountLoading || (ownerWallet && loadingData && !summary && invoices.length === 0)) {
    return <BusinessOverviewSkeleton />;
  }

  if (account && account.account_type !== "BUSINESS") {
    return (
      <div className="section-panel p-8">
        <h2 className="font-heading text-2xl">{t("business.overview")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Overview is available after you upgrade this account to Business.
        </p>
        <Button asChild className="mt-5">
          <Link href="/settings#account-type">Upgrade to Business</Link>
        </Button>
      </div>
    );
  }

  const completion = profileCompletionPercent(profile);
  const businessDisplayName = profile?.business_name || account?.username || "SwiftPay Business";

  // 4. Compute 100% REAL data models without dummy placeholders
  const {
    balanceData,
    metrics,
    activities,
    insights,
    invoiceOverview,
    teamPayments,
    financialHealth,
  } = buildRealOverviewData({
    usdcBalance,
    eurcBalance,
    summary,
    invoices,
    payrollSummary,
    transfers,
    walletAddress: activeAddress,
  });

  const cashFlowSummaries = computeRealCashFlow({
    transfers,
    invoices,
    payrollSummary,
  });

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Page Header with Title, Subtitle, and Verified Business Badge (only if 100% complete) */}
      <BusinessPageHeader
        businessName={businessDisplayName}
        isVerified={completion.percent === 100}
      />

      {/* Profile Completion Callout (if not 100% complete) */}
      {completion.percent < 100 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Business profile {completion.percent}% complete
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Missing details: {completion.missing.join(", ") || "none"}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="border-border">
            <Link href="/business/profile">Complete profile</Link>
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* 2. Primary Financial Command Center (Total Business Balance, Assets, Liquidity) */}
      <BusinessBalanceCard data={balanceData} />

      {/* 3. Primary Action Bar (Send Payment in Imperial Purple #5B21B6, Create Invoice, Request, Pay Team, BatchPay) */}
      <BusinessQuickActions />

      {/* 4. Business Metrics Grid (Revenue Received, Payments Sent, Outstanding Invoices, Scheduled Payments) */}
      <BusinessMetricsGrid metrics={metrics} />

      {/* 5. Cash Flow Section (Dual curve interactive chart, 7D/30D/3M/1Y tabs, incoming/outgoing/net summary) */}
      <CashFlowCard summariesByPeriod={cashFlowSummaries} />

      {/* 6. Two-Column Business Operations Section (Business Activity & Business Insights) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BusinessActivityCard activities={activities} />
        <BusinessInsightsCard insights={insights} />
      </div>

      {/* 7. Two-Column Invoices & Team Payments Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InvoiceOverviewCard data={invoiceOverview} />
        <TeamPaymentsCard data={teamPayments} />
      </div>

      {/* 8. Business Financial Health Section (4 Pillars: Cash Position, Payment Activity, Invoice Collection, Obligations) */}
      <BusinessHealthCard data={financialHealth} />
    </div>
  );
}
