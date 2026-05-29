"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  FileCheck2,
  Landmark,
  LineChart,
  Link2,
  LockKeyhole,
  PieChart,
  QrCode,
  Repeat2,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

import {
  circleSessionEventName,
  readCircleWallets,
  shortenCircleAddress,
} from "@/lib/circle-session";
import {
  platformAnalyticsUpdatedEvent,
  type PlatformAnalyticsSummary,
  type PlatformPaymentEventType,
} from "@/lib/platform-analytics";

type PaymentMetric = {
  detail: string;
  icon: LucideIcon;
  label: string;
  title: string;
  value: string;
};

type PaymentService = {
  barClassName: string;
  detail: string;
  eventType: PlatformPaymentEventType;
  href: string;
  icon: LucideIcon;
  label: string;
  share: number;
  value: string;
};

function createDefaultSummary(): PlatformAnalyticsSummary {
  return {
    generatedAt: new Date().toISOString(),
    rails: [
      { count: 0, symbol: "USDC", volume: 0 },
      { count: 0, symbol: "EURC", volume: 0 },
    ],
    services: [
      { count: 0, eventType: "direct_send", share: 24, volume: 0 },
      { count: 0, eventType: "payment_request", share: 18, volume: 0 },
      { count: 0, eventType: "swap", share: 16, volume: 0 },
      { count: 0, eventType: "private_send", share: 14, volume: 0 },
      { count: 0, eventType: "payroll", share: 18, volume: 0 },
      { count: 0, eventType: "claim", share: 10, volume: 0 },
    ],
    totals: {
      activeRails: 2,
      paymentEvents: 0,
      paymentServices: 6,
      profileCreations: 0,
      totalVolume: 0,
    },
    trend: [
      { count: 0, label: "Mon", volume: 0 },
      { count: 0, label: "Tue", volume: 0 },
      { count: 0, label: "Wed", volume: 0 },
      { count: 0, label: "Thu", volume: 0 },
      { count: 0, label: "Fri", volume: 0 },
      { count: 0, label: "Sat", volume: 0 },
      { count: 0, label: "Sun", volume: 0 },
    ],
  };
}

function formatStableAmount(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
    minimumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  })}`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

const paymentServiceTrend = [
  { height: "78%", label: "Send", value: "Direct" },
  { height: "62%", label: "Pay", value: "Requests" },
  { height: "54%", label: "Swap", value: "Rebalance" },
  { height: "86%", label: "Codes", value: "Private" },
  { height: "70%", label: "Payroll", value: "Batch" },
  { height: "58%", label: "Claim", value: "Desk" },
  { height: "66%", label: "Rails", value: "2 assets" },
];

const paymentServices: PaymentService[] = [
  {
    barClassName: "bg-swift-600",
    detail: "Wallet-to-wallet outgoing payments",
    eventType: "direct_send",
    href: "/dashboard",
    icon: ArrowUpRight,
    label: "Direct sends",
    share: 24,
    value: "Core",
  },
  {
    barClassName: "bg-emerald-500",
    detail: "Payment links, QR requests, and receipts",
    eventType: "payment_request",
    href: "/pay",
    icon: ArrowDownLeft,
    label: "Payment requests",
    share: 18,
    value: "Request",
  },
  {
    barClassName: "bg-cyan-500",
    detail: "USDC and EURC balance rebalancing",
    eventType: "swap",
    href: "/swap",
    icon: Repeat2,
    label: "Swaps",
    share: 16,
    value: "Rebalance",
  },
  {
    barClassName: "bg-amber-500",
    detail: "Private send, payroll, and claim-code tools",
    eventType: "private_send",
    href: "/privSwiftPay",
    icon: LockKeyhole,
    label: "Private workflows",
    share: 42,
    value: "Suite",
  },
];

const serviceSignals: Array<{
  icon: LucideIcon;
  label: string;
  status: string;
  value: string;
}> = [
  {
    icon: Wallet,
    label: "Direct payments",
    status: "Wallet-to-wallet stablecoin transfers",
    value: "Send",
  },
  {
    icon: QrCode,
    label: "Payment requests",
    status: "QR and link-based collection flows",
    value: "Pay",
  },
  {
    icon: Repeat2,
    label: "Swap service",
    status: "USDC and EURC rebalancing",
    value: "Swap",
  },
  {
    icon: LockKeyhole,
    label: "Private send",
    status: "Funded claim-code payments",
    value: "Codes",
  },
  {
    icon: Landmark,
    label: "Payroll",
    status: "Batch claim-code folders",
    value: "Batch",
  },
  {
    icon: FileCheck2,
    label: "Claim desk",
    status: "Receiver claim workflow",
    value: "Claim",
  },
];

export function PlatformAnalyticsView() {
  const { address: externalAddress, isConnected } = useAccount();
  const [circleAddress, setCircleAddress] = useState<string | undefined>();
  const [summary, setSummary] = useState<PlatformAnalyticsSummary>(() =>
    createDefaultSummary(),
  );

  useEffect(() => {
    function syncCircleAddress() {
      const walletAddress = readCircleWallets().find((wallet) =>
        wallet.address && isAddress(wallet.address),
      )?.address;

      setCircleAddress(walletAddress);
    }

    syncCircleAddress();
    window.addEventListener(circleSessionEventName, syncCircleAddress);
    window.addEventListener("storage", syncCircleAddress);

    return () => {
      window.removeEventListener(circleSessionEventName, syncCircleAddress);
      window.removeEventListener("storage", syncCircleAddress);
    };
  }, []);

  const activeAddress =
    isConnected && externalAddress
      ? externalAddress
      : circleAddress && isAddress(circleAddress)
        ? circleAddress
        : undefined;
  const walletContext = activeAddress
    ? shortenCircleAddress(activeAddress)
    : "Ready";
  const hasRecordedEvents = summary.totals.paymentEvents > 0;

  const loadAnalytics = useCallback(async () => {
    try {
      const response = await fetch("/api/analytics", {
        cache: "no-store",
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        return;
      }

      setSummary((await response.json()) as PlatformAnalyticsSummary);
    } catch {
      setSummary((current) => current);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();

    const interval = window.setInterval(() => {
      void loadAnalytics();
    }, 30_000);

    window.addEventListener(platformAnalyticsUpdatedEvent, loadAnalytics);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(platformAnalyticsUpdatedEvent, loadAnalytics);
    };
  }, [loadAnalytics]);

  const renderedTrend = useMemo(() => {
    if (!hasRecordedEvents) {
      return paymentServiceTrend;
    }

    const maxValue = Math.max(
      ...summary.trend.map((point) => point.volume || point.count),
      1,
    );

    return summary.trend.map((point) => {
      const value = point.volume || point.count;

      return {
        height:
          value === 0
            ? "12%"
            : `${Math.max(18, Math.round((value / maxValue) * 100))}%`,
        label: point.label,
        value: point.volume > 0 ? formatStableAmount(point.volume) : `${point.count}`,
      };
    });
  }, [hasRecordedEvents, summary.trend]);

  const metrics: PaymentMetric[] = [
    {
      detail: "Send, request, swap, private send, payroll, and claims",
      icon: BarChart3,
      label: "Coverage",
      title: "Payment services",
      value: String(summary.totals.paymentServices),
    },
    {
      detail: "USDC and EURC payment rails on Arc Testnet",
      icon: CircleDollarSign,
      label: "Stablecoins",
      title: "Active rails",
      value: String(summary.totals.activeRails),
    },
    {
      detail: "Recorded sends, requests, swaps, payroll, and claims",
      icon: Link2,
      label: "Events",
      title: "Payment activity",
      value: formatCount(summary.totals.paymentEvents),
    },
    {
      detail: "Circle wallet setups and external wallet profiles",
      icon: Users,
      label: "Profiles",
      title: "Profile creation",
      value: formatCount(summary.totals.profileCreations),
    },
    {
      detail: "Total recorded stablecoin movement",
      icon: LockKeyhole,
      label: "Volume",
      title: "Payment volume",
      value: formatStableAmount(summary.totals.totalVolume),
    },
  ];

  return (
    <section className="surface-panel overflow-hidden" id="analytics">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(24rem,1.05fr)]">
        <div className="border-b border-lavender-100 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-swift-600 text-white shadow-[0_14px_30px_rgba(66,17,143,0.22)]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <p className="eyebrow">Payment analytics</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-normal text-ink sm:text-4xl">
            Payment-service overview.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            A professional analytics view of SwiftPay payment services across
            sends, requests, swaps, private claim codes, payroll, and claims.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => {
              const Icon = metric.icon;

              return (
                <article className="surface-card p-4" key={metric.title}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                        {metric.title}
                      </p>
                      <p className="mt-3 font-heading text-3xl font-semibold tracking-normal text-ink">
                        {metric.value}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-md bg-lavender-50 px-2 py-1 font-black text-swift-700">
                      {metric.label}
                    </span>
                    <span className="font-semibold text-muted">
                      {metric.detail}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Service snapshot</p>
              <h3 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink">
                Coverage, mix, and payment flows
              </h3>
            </div>
            <Link
              className="font-ui inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white hover:text-swift-700 active:translate-y-0"
              href="/dashboard#activity"
            >
              Activity
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="surface-card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">
                  Payment service coverage
                </p>
                <p className="text-xs font-semibold text-muted">
                  Core workflows available across the platform
                </p>
              </div>
              <LineChart className="h-5 w-5 shrink-0 text-swift-600" />
            </div>
            <div className="grid h-48 grid-cols-7 items-end gap-2 rounded-lg border border-lavender-100 bg-lavender-50/70 p-3">
              {renderedTrend.map((point) => (
                <div
                  className="flex h-full min-w-0 flex-col justify-end gap-2"
                  key={point.label}
                >
                  <div className="flex min-h-0 flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-swift-600 to-lavender-500 shadow-[0_10px_20px_rgba(66,17,143,0.14)]"
                      style={{ height: point.height }}
                      title={`${point.label}: ${point.value}`}
                    />
                  </div>
                  <div className="grid gap-1 text-center">
                    <span className="truncate text-[0.68rem] font-black uppercase text-muted">
                      {point.label}
                    </span>
                    <span className="truncate text-[0.68rem] font-bold text-ink">
                      {point.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="surface-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    Payment service mix
                  </p>
                  <p className="text-xs font-semibold text-muted">
                    Service weight by payment workflow category
                  </p>
                </div>
                <PieChart className="h-5 w-5 shrink-0 text-swift-600" />
              </div>
              <div className="grid gap-4">
                {paymentServices.map((service) => {
                  const Icon = service.icon;
                  const serviceSummaries =
                    service.eventType === "private_send"
                      ? summary.services.filter((item) =>
                          ["private_send", "payroll", "claim"].includes(
                            item.eventType,
                          ),
                        )
                      : summary.services.filter(
                          (item) => item.eventType === service.eventType,
                        );
                  const serviceCount = serviceSummaries.reduce(
                    (total, item) => total + item.count,
                    0,
                  );
                  const serviceVolume = serviceSummaries.reduce(
                    (total, item) => total + item.volume,
                    0,
                  );
                  const serviceShare =
                    serviceSummaries.length > 0
                      ? serviceSummaries.reduce(
                          (total, item) => total + item.share,
                          0,
                        )
                      : service.share;
                  const serviceValue =
                    hasRecordedEvents
                      ? `${serviceCount} / ${formatStableAmount(serviceVolume)}`
                      : service.value;

                  return (
                    <Link
                      className="grid gap-2"
                      href={service.href}
                      key={service.label}
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lavender-50 text-swift-700">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink">
                              {service.label}
                            </p>
                            <p className="truncate text-xs font-semibold text-muted">
                              {service.detail}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-xs font-black text-swift-700">
                          {serviceValue}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-lavender-100">
                        <div
                          className={`h-full rounded-full ${service.barClassName}`}
                          style={{ width: `${serviceShare}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-ink">
                    Payment services
                  </p>
                  <p className="text-xs font-semibold text-muted">
                    Enabled workflows and wallet context
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 shrink-0 text-swift-600" />
              </div>
              <div className="grid gap-3">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-lavender-100 bg-white/70 px-3 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lavender-50 text-swift-700">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">
                      Wallet context
                    </span>
                    <span className="block truncate text-xs font-semibold text-muted">
                      Platform payment access
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs font-black text-swift-700">
                    {walletContext}
                  </span>
                </div>

                {serviceSignals.map((signal) => {
                  const Icon = signal.icon;

                  return (
                    <div
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-lavender-100 bg-white/70 px-3 py-3"
                      key={signal.label}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lavender-50 text-swift-700">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">
                          {signal.label}
                        </span>
                        <span className="block truncate text-xs font-semibold text-muted">
                          {signal.status}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs font-black text-swift-700">
                        {signal.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
