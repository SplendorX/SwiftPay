"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Globe2,
  Landmark,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { FadeUp, Stagger, StaggerItem } from "@/components/design/motion";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TrackStatus = "completed" | "in-progress" | "upcoming";

const roadmapTracks: Array<{
  body: string;
  icon: LucideIcon;
  items: string[];
  phase: string;
  status: TrackStatus;
  title: string;
}> = [
  {
    body: "Make everyday stablecoin movement feel as simple as a fintech account balance.",
    icon: Zap,
    items: ["Send and swap flows", "Payment request links", "Recurring payments", "Privacy payments and bulk payments"],
    phase: "Phase 01",
    status: "completed",
    title: "Core Money Movement",
  },
  {
    body: "Reduce onboarding friction while giving users stronger account controls.",
    icon: CheckCircle2,
    items: [
      "Google login with Circle wallets",
      "Email-based wallet creation",
      "Profile updates and usernames",
      "Username transactions",
      "Session and device management",
    ],
    phase: "Phase 02",
    status: "completed",
    title: "Identity And Wallet Access",
  },
  {
    body: "Expand SwiftPay from single-network payments into broader liquidity and routing.",
    icon: Globe2,
    items: ["Liquidity pool", "Multi-chain support", "Cross-chain bridging", "Gateway infrastructure"],
    phase: "Phase 03",
    status: "upcoming",
    title: "Liquidity And Network Expansion",
  },
  {
    body: "Add savings, rewards, and retention loops around stablecoin balances.",
    icon: CircleDollarSign,
    items: ["Stable savings account", "Auto-yield stablecoin vaults", "Staking rewards", "Cashback rewards", "Referral system"],
    phase: "Phase 04",
    status: "upcoming",
    title: "Yield, Rewards, And Growth",
  },
  {
    body: "Move from payment tools to guided financial automation.",
    icon: Bot,
    items: ["AI spending insights", "Smart budgeting assistant", "Natural language payments", "AI payment agent"],
    phase: "Phase 05",
    status: "upcoming",
    title: "AI Finance Assistant",
  },
  {
    body: "Connect onchain balances back into local financial rails and advanced markets.",
    icon: Landmark,
    items: ["Local bank withdrawals", "Prediction markets"],
    phase: "Phase 06",
    status: "upcoming",
    title: "Fiat Rails And Advanced Products",
  },
];

const statusMeta: Record<TrackStatus, { icon: LucideIcon; label: string; variant: "default" | "secondary" | "outline" }> = {
  completed: { icon: CheckCircle2, label: "Completed", variant: "default" },
  "in-progress": { icon: Clock3, label: "In progress", variant: "secondary" },
  upcoming: { icon: Sparkles, label: "Upcoming", variant: "outline" },
};

function RoadmapTimeline() {
  return (
    <div className="relative">
      <div className="absolute top-0 bottom-0 left-4 w-px bg-border md:left-1/2" />
      <Stagger className="space-y-5">
        {roadmapTracks.map((track, index) => {
          const Icon = track.icon;
          const meta = statusMeta[track.status];
          const StatusIcon = meta.icon;

          return (
            <StaggerItem key={track.title}>
              <motion.div
                className={`relative grid gap-4 md:grid-cols-2 md:gap-8 ${
                  index % 2 === 1 ? "md:[&>article]:md:col-start-2" : ""
                }`}
                initial={{ opacity: 0, x: index % 2 === 0 ? -12 : 12 }}
                viewport={{ once: true, margin: "-40px" }}
                whileInView={{ opacity: 1, x: 0 }}
              >
                <article className="feature-card rounded-xl border p-5 md:ml-8">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant={meta.variant}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {meta.label}
                    </Badge>
                    <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      {track.phase}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-lg font-semibold">{track.title}</h2>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{track.body}</p>
                    </div>
                    <div className="feature-icon shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-1.5">
                    {track.items.map((item) => (
                      <div
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium"
                        key={item}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {item}
                      </div>
                    ))}
                  </div>
                </article>
              </motion.div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}

export function RoadmapPageContent() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Product timeline"
        title="Roadmap"
      >
        <section className="section-panel lg:grid lg:grid-cols-[1fr_16rem] lg:gap-6">
          <FadeUp>
            <Badge className="mb-3" variant="secondary">
              <Zap className="mr-1 h-3 w-3" />
              SwiftPay OS
            </Badge>
            <h1 className="font-heading max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Building financial infrastructure, phase by phase.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              From core money movement to identity, liquidity, AI automation,
              and fiat rails — a product timeline for teams shipping real
              payment workflows.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/privSwiftPay">View privacy flows</Link>
              </Button>
            </div>
          </FadeUp>

          <div className="mt-5 grid gap-2 lg:mt-0">
            {[
              { label: "Tracks", value: "6" },
              { label: "Feature bets", value: "24" },
              { label: "Focus", value: "SwiftPay OS" },
            ].map((stat) => (
              <Card className="feature-card" key={stat.label}>
                <CardContent className="p-3.5">
                  <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 font-heading text-xl font-semibold">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <RoadmapTimeline />

        <Card className="feature-card privacy-hero">
          <CardHeader>
            <CardTitle className="font-heading text-xl">AI Payment Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              Natural language payments with guardrails — users instruct an
              assistant to execute common financial tasks while SwiftPay keeps
              approvals, wallets, and transaction state visible.
            </p>
          </CardContent>
        </Card>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}