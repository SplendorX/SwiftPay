import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  Globe2,
  Landmark,
  Link2,
  LockKeyhole,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformPageBody } from "@/components/platform-page-body";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

const roadmapTracks: Array<{
  body: string;
  icon: LucideIcon;
  items: string[];
  phase: string;
  title: string;
}> = [
  {
    body: "Make everyday stablecoin movement feel as simple as a fintech account balance.",
    icon: Wallet,
    items: [
      "Send and swap flows",
      "Payment request links",
      "Recurring payments",
      "Privacy payments and bulk payments",
    ],
    phase: "Phase 01",
    title: "Core Money Movement",
  },
  {
    body: "Reduce onboarding friction while giving users stronger account controls.",
    icon: ShieldCheck,
    items: [
      "Google login with Circle wallets",
      "Email-based wallet creation",
      "Profile updates and usernames",
      "Session and device management",
    ],
    phase: "Phase 02",
    title: "Identity And Wallet Access",
  },
  {
    body: "Expand SwiftPay from single-network payments into broader liquidity and routing.",
    icon: Globe2,
    items: [
      "Liquidity pool",
      "Multi-chain support",
      "Cross-chain bridging",
      "Gateway infrastructure",
    ],
    phase: "Phase 03",
    title: "Liquidity And Network Expansion",
  },
  {
    body: "Add savings, rewards, and retention loops around stablecoin balances.",
    icon: CircleDollarSign,
    items: [
      "Stable savings account",
      "Auto-yield stablecoin vaults",
      "Staking rewards",
      "Cashback rewards",
      "Referral system",
    ],
    phase: "Phase 04",
    title: "Yield, Rewards, And Growth",
  },
  {
    body: "Move from payment tools to guided financial automation.",
    icon: Bot,
    items: [
      "AI spending insights",
      "Smart budgeting assistant",
      "Natural language payments",
      "AI payment agent",
    ],
    phase: "Phase 05",
    title: "AI Finance Assistant",
  },
  {
    body: "Connect onchain balances back into local financial rails and advanced markets.",
    icon: Landmark,
    items: ["Local bank withdrawals", "Prediction markets"],
    phase: "Phase 06",
    title: "Fiat Rails And Advanced Products",
  },
];

const agentActions = [
  "Pay bills",
  "Manage subscriptions",
  "Optimize transaction fees",
  "Schedule transfers",
];

const roadmapStats = [
  { label: "Tracks", value: "6" },
  { label: "Feature bets", value: "24" },
  { label: "Focus", value: "SwiftPay OS" },
];

export default function RoadmapPage() {
  return (
    <PlatformAccessGate>
        <main className="relative min-h-screen overflow-hidden px-0 py-4 text-ink sm:px-6 lg:px-8">
          <div className="dashboard-ambient pointer-events-none absolute inset-0" />
          <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

          <div className="relative mx-auto flex w-full max-w-none flex-col gap-4">
            <header className="surface-panel sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
              <Link
                className="flex min-w-0 items-center gap-3 justify-self-start"
                href="/"
              >
                <BrandMark className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                    <span className="text-ink">Swift</span>
                    <span className="text-swift-700">Pay</span>
                  </p>
                  <p className="truncate text-sm font-semibold text-muted sm:text-base">
                    Product roadmap
                  </p>
                </div>
              </Link>

              <PlatformProfileControls />
            </header>

            <PlatformPageBody>
            <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_24rem] lg:items-stretch">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lavender-200 bg-white/80 px-3 py-2 text-xs font-bold text-swift-700 shadow-sm">
                  <Zap className="h-3.5 w-3.5" />
                  SwiftPay Roadmap
                </div>
                <h1 className="font-heading max-w-4xl text-3xl font-semibold leading-tight tracking-normal text-ink sm:text-5xl">
                  Building SwiftPay into a stablecoin operating system.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
                  The roadmap moves from fast payment primitives into identity,
                  liquidity, rewards, AI automation, and local banking rails.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.34)] active:translate-y-0"
                    href="/dashboard"
                  >
                    Open dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
                    href="/privSwiftPay"
                  >
                    View privacy flows
                  </Link>
                </div>
              </div>

              <div className="grid gap-3">
                {roadmapStats.map((stat) => (
                  <div className="surface-card px-4 py-4" key={stat.label}>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                      {stat.label}
                    </p>
                    <p className="mt-2 font-heading text-2xl font-semibold text-ink">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {roadmapTracks.map((track) => {
                const Icon = track.icon;

                return (
                  <article
                    className="surface-card p-5 transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_14px_30px_rgba(66,17,143,0.10)]"
                    key={track.title}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="eyebrow">{track.phase}</p>
                        <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
                          {track.title}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {track.body}
                        </p>
                      </div>
                      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-2">
                      {track.items.map((item) => (
                        <div
                          className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-white/75 px-3 py-2 text-sm font-semibold text-ink"
                          key={item}
                        >
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-swift-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="surface-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[0.8fr_1fr]">
              <div>
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-swift-600 text-white shadow-[0_14px_30px_rgba(66,17,143,0.22)]">
                  <Bot className="h-5 w-5" />
                </div>
                <p className="eyebrow">AI Payment Agent</p>
                <h2 className="mt-3 font-heading text-3xl font-semibold tracking-normal text-ink">
                  Natural language payments with guardrails.
                </h2>
                <p className="mt-3 text-base leading-7 text-muted">
                  Users will be able to instruct an assistant to execute common
                  financial tasks while SwiftPay keeps approvals, wallets, and
                  transaction state visible.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {agentActions.map((action) => (
                  <div
                    className="surface-card flex min-h-24 items-center gap-3 px-4 py-4"
                    key={action}
                  >
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lavender-50 text-swift-700">
                      <ReceiptText className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-bold text-ink">{action}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  body: "Request links, gateway flows, and bank withdrawals expand how users enter and exit SwiftPay.",
                  icon: Link2,
                  title: "Distribution",
                },
                {
                  body: "Usernames, email wallets, and device controls turn wallet access into account-grade UX.",
                  icon: Users,
                  title: "Account Layer",
                },
                {
                  body: "Savings vaults, staking, cashback, referrals, and liquidity pools support long-term balances.",
                  icon: Repeat2,
                  title: "Balance Growth",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <article className="surface-card p-5" key={item.title}>
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="font-heading text-lg font-semibold text-ink">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {item.body}
                    </p>
                  </article>
                );
              })}
            </section>
            </PlatformPageBody>
          </div>
        </main>
    </PlatformAccessGate>
  );
}
