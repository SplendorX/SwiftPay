"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  Layers,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FeatureStories } from "@/components/landing/feature-stories";
import { HeroWelcome } from "@/components/landing/hero-welcome";
import { LandingFooter } from "@/components/landing/landing-footer";
import {
  LaunchAppLink,
  signInModalEventName,
} from "@/components/landing/launch-app-link";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { SignInPanel } from "@/components/landing/sign-in-panel";
import { FadeUp, Stagger, StaggerItem } from "@/components/design/motion";
import { MarketingShell } from "@/components/layout/marketing-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

const productFlows = [
  {
    body: "Portfolio balance, interactive value history, direct sends, beneficiaries, receipts, and activity.",
    href: "/dashboard",
    icon: Wallet,
    title: "Dashboard",
  },
  {
    body: "Private groups for chat, split payments, shared Save pockets, and multi-approval withdrawals.",
    href: "/swiftCircle",
    icon: UsersRound,
    title: "Circle",
  },
  {
    body: "Savings pockets and Spend&Save. No interest, just structured saving.",
    href: "/save",
    icon: PiggyBank,
    title: "Save",
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
    body: "Schedule recurring payments, authorize Autopay once, and let due settlements run in the background.",
    href: "/swiftRecurepay",
    icon: CalendarClock,
    title: "RecurePay",
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
    description: "Recurring schedules, invoices, and savings rules share the same wallet profile.",
    stat: "Profile scoped",
    title: "Automation suite",
  },
];

const howItWorksSteps = [
  {
    detail: "Sign in with a Circle Google wallet or connect MetaMask / any Arc-compatible external wallet.",
    label: "Connect your wallet",
    step: "01",
  },
  {
    detail: "Pick USDC or EURC, enter a username, wallet address, or upload a batch CSV for up to 500 recipients.",
    label: "Choose amount and recipient",
    step: "02",
  },
  {
    detail: "Confirm the transaction. Gas is paid in USDC. Track status in real time and view the ArcScan receipt instantly.",
    label: "Confirm and settle",
    step: "03",
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
      "SwiftPay includes Dashboard, Swift+Save, Earn, Swap, SwiftBatch, RecurePay, Payment requests, Circle, Docs, and Settings. The main product workflows are linked directly from the product section.",
    question: "Which pages are available?",
  },
  {
    answer:
      "Swift+Save creates non-interest savings pockets and Spend&Save rules. Earn is separate and shows vault performance, earnings context, and Auto-Save controls where supported.",
    question: "How are Swift+Save and Earn different?",
  },
  {
    answer:
      "Yes. Payment requests create links and QR codes, SwiftBatch handles CSV payouts up to 500 recipients, RecurePay manages recurring schedules, and Circle groups share chat, splits, and savings.",
    question: "Can I request, batch, or schedule payments?",
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

const whyItems = [
  {
    body: "USDC and EURC on Arc. Stable by default, not speculative.",
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
];

/**
 * Security & Trust claims.
 *
 * All claims are scoped to what the product actually does today on Arc Testnet.
 * Items labelled "coming soon" are clearly marked.
 * No claim should be made here that isn't verifiable in the running product.
 */
const trustItems = [
  {
    body: "Your funds are never held by SwiftPay. Every transaction is signed by your wallet and settled directly on Arc.",
    icon: Fingerprint,
    link: null,
    linkLabel: null,
    title: "Non-custodial",
  },
  {
    body: "Smart contract source code is published on ArcScan. You can verify what the contract does before approving any transaction.",
    icon: FileCheck2,
    link: "https://testnet.arcscan.app",
    linkLabel: "View on ArcScan",
    title: "Verified contracts",
  },
  {
    body: "SwiftPay currently runs on Arc Testnet. No real funds are at risk. A mainnet deployment will be announced separately.",
    icon: FlaskConical,
    link: null,
    linkLabel: null,
    title: "Testnet, no real funds",
  },
];

export function LandingPage() {
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    function openSignIn() {
      setSignInOpen(true);
    }

    function hasGoogleLoginCallback() {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const queryParams = new URLSearchParams(window.location.search);
      return Boolean(
        hashParams.get("id_token") ||
          hashParams.get("error") ||
          hashParams.get("state") ||
          queryParams.get("id_token") ||
          queryParams.get("code") ||
          queryParams.get("error") ||
          queryParams.get("state"),
      );
    }

    function openFromHash() {
      if (window.location.hash === "#sign-in" || hasGoogleLoginCallback()) {
        openSignIn();
      }
    }

    openFromHash();
    window.addEventListener(signInModalEventName, openSignIn);
    window.addEventListener("hashchange", openFromHash);

    return () => {
      window.removeEventListener(signInModalEventName, openSignIn);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, []);

  function closeSignIn() {
    setSignInOpen(false);

    if (window.location.hash === "#sign-in") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  return (
    <MarketingShell>
      {/* ── Hero ── */}
      <section className="marketing-hero marketing-hero-with-showcase">
        <HeroWelcome />
        <ProductShowcase placement="hero" />
      </section>

      {/* ── Products ── */}
      <section className="marketing-section" id="products">
        <div className="marketing-section-header">
          <p className="section-eyebrow">Product</p>
          <h2 className="section-title">One platform. Everything Payments.</h2>
          <p className="section-copy">
            Modules designed for settlement clarity, built for teams who need
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
                  <span className="marketing-bento-explore">
                    Explore
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* ── Demonstrations ── */}
      <section className="marketing-section marketing-section-muted">
        <div className="marketing-section-header">
          <p className="section-eyebrow">Demonstrations</p>
          <h2 className="section-title">See how money moves.</h2>
          <p className="section-copy">
            Realistic payment flows, transaction states, and settlement
            visualizations, the way modern fintech products communicate trust.
          </p>
        </div>
        <Stagger className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {demos.map((demo) => (
            <StaggerItem key={demo.title}>
              <article className="marketing-demo-card h-full">
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

      <FeatureStories />

      {/* ── Why SwiftPay ── */}
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
            {whyItems.map((item) => {
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

      {/* ── How It Works ── */}
      <section className="marketing-section marketing-section-muted" id="how-it-works">
        <div className="marketing-section-header">
          <p className="section-eyebrow">How it works</p>
          <h2 className="section-title">Wallet to settlement in three steps.</h2>
          <p className="section-copy">
            No new accounts. No bridge tokens. Connect your wallet and move
            stablecoins with the same clarity as a bank transfer.
          </p>
        </div>

        <Stagger className="hiw-flow">
          {howItWorksSteps.map((s, i) => (
            <StaggerItem className="hiw-step" key={s.step}>
              {/* connector line, hidden on the last item */}
              {i < howItWorksSteps.length - 1 && (
                <div className="hiw-connector" aria-hidden />
              )}
              <div className="hiw-step-number" aria-label={`Step ${s.step}`}>
                {s.step}
              </div>
              <div className="hiw-step-body">
                <div className="hiw-step-check" aria-hidden>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <h3 className="hiw-step-label">{s.label}</h3>
                <p className="hiw-step-detail">{s.detail}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Security & Trust ── */}
      <section className="marketing-section" id="security">
        <div className="marketing-section-header">
          <p className="section-eyebrow">Security &amp; Trust</p>
          <h2 className="section-title">Wallet-signed. On-chain. Checkable.</h2>
          <p className="section-copy">
            You sign every payment. Settlement is public on Arc. The claims
            below are true in the product today.
          </p>
        </div>
        <Stagger className="marketing-trust-grid">
          {trustItems.map((item) => {
            const Icon = item.icon;
            return (
              <StaggerItem key={item.title}>
                <div className="marketing-trust-badge">
                  <div className="marketing-trust-badge-icon" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="marketing-trust-badge-body">
                    <p className="marketing-trust-badge-title">{item.title}</p>
                    <p className="marketing-trust-badge-desc">{item.body}</p>
                    {item.link && (
                      <a
                        className="marketing-contract-link"
                        href={item.link}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.linkLabel}
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* ── FAQ ── */}
      <section className="marketing-section marketing-section-muted" id="faq">
        <div className="marketing-section-header">
          <p className="section-eyebrow">FAQ</p>
          <h2 className="section-title">Common SwiftPay questions.</h2>
          <p className="section-copy">
            A current map of the dashboard, savings, earn, swap, request,
            recurring, batch, private-send, and wallet profile workflows.
          </p>
        </div>
        <Accordion className="marketing-faq-accordion" collapsible type="single">
          {faqItems.map((item, i) => (
            <AccordionItem key={item.question} value={`faq-${i}`}>
              <AccordionTrigger className="marketing-faq-trigger">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="marketing-faq-content">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ── Footer CTA ── */}
      <section className="marketing-cta">
        <div className="marketing-cta-inner">
          <div className="marketing-cta-copy">
            <p className="section-eyebrow">Get started</p>
            <h2>Money Moves Better With SwiftPay.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 sm:text-base">
              One wallet. Instant settlement. Payments that feel finished the
              moment you confirm.
            </p>
            <ul className="marketing-cta-points">
              <li>USDC and EURC on Arc</li>
              <li>Pay, Circle, RecurePay, Batch, Save</li>
              <li>Gas paid in USDC</li>
            </ul>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <LaunchAppLink className="hero-launch-btn">
                Open SwiftPay
                <ArrowRight className="h-4 w-4" />
              </LaunchAppLink>
            </div>
          </div>
          <div className="marketing-cta-media">
            <img
              alt="Sending a payment in SwiftPay"
              draggable={false}
              src="/landing/pay-mac.jpg"
            />
          </div>
        </div>
      </section>

      <LandingFooter />

      {signInOpen ? (
        <div
          aria-modal="true"
          className="sign-in-modal"
          onClick={closeSignIn}
          role="dialog"
        >
          <div
            className="sign-in-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Close sign in"
              className="sign-in-modal-close"
              onClick={closeSignIn}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            <SignInPanel />
          </div>
        </div>
      ) : null}
    </MarketingShell>
  );
}
