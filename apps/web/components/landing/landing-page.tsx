"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  CircleDollarSign,
  Layers,
  LockKeyhole,
  PiggyBank,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  Landmark,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { FloatingActivity } from "@/components/landing/floating-activity";
import { HeroBrandDisplay } from "@/components/landing/hero-brand-display";
import { XLogoLink } from "@/components/brand/x-logo-link";
import { SignInPanel } from "@/components/landing/sign-in-panel";
import { FadeUp, Stagger, StaggerItem } from "@/components/design/motion";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const productFlows = [
  {
    body: "Portfolio balance, interactive value history, direct sends, beneficiaries, receipts, and activity.",
    href: "/dashboard",
    icon: Wallet,
    title: "Dashboard",
  },
  {
    body: "Savings pockets and Spend&Save — no interest, just structured saving.",
    href: "/save",
    icon: PiggyBank,
    title: "Swift+Save",
  },
  {
    body: "Vault performance, earnings context, and Auto-Save controls for supported balances.",
    href: "/earn",
    icon: TrendingUp,
    title: "Earn",
  },
  {
    body: "Swap supported stablecoin balances with Circle-powered routes on Arc Testnet.",
    href: "/swap",
    icon: RefreshCw,
    title: "Swap",
  },
  {
    body: "CSV upload, validation, and settlement for up to 500 recipients.",
    href: "/swiftBatch",
    icon: Users,
    title: "Batch settlement",
  },
  {
    body: "Payment links, QR codes, expiration controls, and request tracking.",
    href: "/pay",
    icon: ReceiptText,
    title: "Payment requests",
  },
  {
    body: "Schedule recurring payments, monitor upcoming runs, and execute due settlements.",
    href: "/swiftRecurepay",
    icon: CalendarClock,
    title: "SwiftRecurepay",
  },
  {
    body: "Privacy-first claim codes with receiver-bound settlement on Arc.",
    href: "/privSwiftPay",
    icon: LockKeyhole,
    title: "PrivSwiftPay",
  },
];

const demos = [
  {
    description: "Route visualization from sender through Arc to recipient with fee transparency.",
    stat: "< 2s finality",
    title: "Payment routing",
  },
  {
    description: "Drag-and-drop CSV, validation engine, and progress tracking for enterprise payouts.",
    stat: "500 recipients",
    title: "Batch settlement",
  },
  {
    description: "Generate links, QR codes, and track request status from a collection hub.",
    stat: "Real-time status",
    title: "Payment requests",
  },
  {
    description: "Recurring schedules, private claim codes, and savings rules share the same wallet profile.",
    stat: "Profile scoped",
    title: "Automation suite",
  },
];

const faqItems = [
  {
    answer:
      "Use the dashboard for portfolio value, token balances, direct sends, beneficiaries, transaction receipts, and wallet activity. The send panel is organized as a step-by-step payment flow.",
    question: "What is on the dashboard?",
  },
  {
    answer:
      "SwiftPay includes Dashboard, Swift+Save, Earn, Swap, SwiftBatch, SwiftRecurepay, Payment requests, PrivSwiftPay, Docs, Roadmap, and Settings. The main product workflows are linked directly from the product section.",
    question: "Which pages are available?",
  },
  {
    answer:
      "Swift+Save creates non-interest savings pockets and Spend&Save rules. Earn is separate and shows vault performance, earnings context, and Auto-Save controls where supported.",
    question: "How are Swift+Save and Earn different?",
  },
  {
    answer:
      "Yes. Payment requests create links and QR codes, SwiftBatch handles CSV payouts up to 500 recipients, SwiftRecurepay manages recurring schedules, and PrivSwiftPay creates receiver-bound claim-code settlement flows.",
    question: "Can I request, batch, schedule, or send privately?",
  },
  {
    answer:
      "Sign in with a Circle Google wallet or connect an external wallet. Settings lets users edit their wallet profile, username, and profile photo from their local device.",
    question: "How do users manage their wallet profile?",
  },
  {
    answer:
      "The app is built around Arc Testnet with USDC-native gas and stablecoin workflows such as USDC and EURC. Transactions expose ArcScan context where available.",
    question: "What network and assets does SwiftPay use?",
  },
];

function HeroVisual() {
  return (
    <div className="landing-preview-wrap">
      <HeroBrandDisplay />
      <div className="landing-preview-stack">
        <motion.div
          className="landing-preview-panel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        >
          <DashboardPreview />
        </motion.div>
        <FloatingActivity />
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <MarketingShell>
      <section className="marketing-hero">
        <FadeUp className="marketing-hero-visual mx-auto w-full max-w-[30rem] lg:mx-0 lg:max-w-none">
          <HeroVisual />
        </FadeUp>

        <FadeUp className="marketing-hero-copy" delay={0.08}>
          <SignInPanel />
          <Badge className="mb-5 mt-8" variant="secondary">
            <Landmark className="mr-1 h-3 w-3" />
            Money movement infrastructure
          </Badge>
          <h1 className="marketing-headline">
            Financial infrastructure for the internet.
          </h1>
          <p className="marketing-lead">
            SwiftPay is how startups, businesses, and creators move stablecoins —
            send, batch, request, swap, and settle on Arc. Not another crypto
            dashboard. Real payment infrastructure.
          </p>
          <div className="marketing-hero-actions">
            <Button asChild className="h-10 px-5" size="lg">
              <a href="#sign-in">
                Continue with Google
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild className="h-10" size="lg" variant="outline">
              <Link href="/roadmap">
                View Roadmap
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Arc Testnet
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              USDC-native gas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Wallet-signed settlements
            </span>
          </div>
        </FadeUp>
      </section>

      <section className="marketing-section" id="products">
        <div className="marketing-section-header">
          <p className="section-eyebrow">Product</p>
          <h2 className="section-title">One platform. Every payment workflow.</h2>
          <p className="section-copy">
            Modules designed for settlement clarity — built for teams who need
            money to move, not contracts to inspect.
          </p>
        </div>
        <Stagger className="marketing-bento">
          {productFlows.map((flow) => {
            const Icon = flow.icon;
            return (
              <StaggerItem key={flow.title}>
                <Link className="marketing-bento-card group" href={flow.href}>
                  <div className="feature-icon">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-heading text-base font-semibold">{flow.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{flow.body}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary">
                    Explore
                    <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      <section className="marketing-section marketing-section-muted">
        <div className="marketing-section-header">
          <p className="section-eyebrow">Demonstrations</p>
          <h2 className="section-title">See how money moves.</h2>
          <p className="section-copy">
            Realistic payment flows, transaction states, and settlement
            visualizations — the way modern fintech products communicate trust.
          </p>
        </div>
        <Stagger className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {demos.map((demo) => (
            <StaggerItem key={demo.title}>
              <article className="marketing-value-card h-full">
                <Badge className="mb-3" variant="outline">
                  {demo.stat}
                </Badge>
                <h3 className="font-heading font-semibold">{demo.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {demo.description}
                </p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="marketing-section">
        <div className="marketing-split">
          <FadeUp>
            <p className="section-eyebrow">Why SwiftPay</p>
            <h2 className="section-title">Built like fintech. Settles onchain.</h2>
            <p className="section-copy">
              Payments feel like moving money. Balances, routes, and receipts stay
              readable from the first connection to the final ArcScan receipt.
            </p>
          </FadeUp>
          <Stagger className="marketing-value-grid">
            {[
              {
                body: "USDC and EURC on Arc — stable by default, not speculative.",
                icon: CircleDollarSign,
                title: "Stable by default",
              },
              {
                body: "Send, batch, request, and privacy flows share one visual language.",
                icon: Layers,
                title: "Unified operations",
              },
              {
                body: "Wallet-signed actions and ArcScan verification at every step.",
                icon: ShieldCheck,
                title: "Financial-grade trust",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <StaggerItem key={item.title}>
                  <div className="marketing-value-card">
                    <div className="feature-icon mb-2">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-heading font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      <section className="marketing-section marketing-section-muted">
        <div className="marketing-split marketing-split-center">
          <FadeUp>
            <p className="section-eyebrow">How it works</p>
            <h2 className="section-title">Wallet to settlement in three steps.</h2>
          </FadeUp>
          <div className="grid gap-2">
            {[
              "Connect with Google or an external wallet on Arc Testnet.",
              "Choose USDC or EURC and enter your recipient or batch list.",
              "Confirm, receive by QR, swap balances, or settle privately.",
            ].map((step, index) => (
              <FadeUp delay={index * 0.06} key={step}>
                <div className="step-card">
                  <span className="step-index">{index + 1}</span>
                  <p className="text-sm font-medium">{step}</p>
                  <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section" id="faq">
        <div className="marketing-section-header">
          <p className="section-eyebrow">FAQ</p>
          <h2 className="section-title">Common SwiftPay questions.</h2>
          <p className="section-copy">
            A current map of the dashboard, savings, earn, swap, request,
            recurring, batch, private-send, and wallet profile workflows.
          </p>
        </div>
        <Stagger className="marketing-faq-grid">
          {faqItems.map((item) => (
            <StaggerItem key={item.question}>
              <details className="marketing-faq-item">
                <summary>
                  <span>{item.question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0" />
                </summary>
                <p>{item.answer}</p>
              </details>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="marketing-cta">
        <div className="marketing-cta-inner">
          <div>
            <p className="section-eyebrow text-primary-foreground/70">Get started</p>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl">
              Start building payment flows people trust.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-primary-foreground/80">
              Infrastructure for real money movement — not just another crypto app.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="h-10 bg-background text-foreground hover:bg-background/90" size="lg">
                <a href="#sign-in">Continue with Google</a>
              </Button>
            </div>
          </div>
          <TrendingUp className="hidden h-24 w-24 text-primary-foreground/12 lg:block" />
        </div>
      </section>

      <footer className="marketing-footer">
        <XLogoLink />
      </footer>
    </MarketingShell>
  );
}
