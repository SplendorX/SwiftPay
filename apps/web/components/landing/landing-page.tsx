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
import { useT } from "@/components/locale-provider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export function LandingPage() {
  const t = useT();
  const [signInOpen, setSignInOpen] = useState(false);
  const productFlows = [
    {
      body: t("landing.flowDashboardBody"),
      href: "/dashboard",
      icon: Wallet,
      title: t("landing.flowDashboardTitle"),
    },
    {
      body: t("landing.flowCircleBody"),
      href: "/swiftCircle",
      icon: UsersRound,
      title: t("landing.flowCircleTitle"),
    },
    {
      body: t("landing.flowSaveBody"),
      href: "/save",
      icon: PiggyBank,
      title: t("landing.flowSaveTitle"),
    },
    {
      body: t("landing.flowEarnBody"),
      href: "/earn",
      icon: TrendingUp,
      title: t("landing.flowEarnTitle"),
    },
    {
      body: t("landing.flowSwapBody"),
      href: "/swap",
      icon: RefreshCw,
      title: t("landing.flowSwapTitle"),
    },
    {
      body: t("landing.flowBatchBody"),
      href: "/swiftBatch",
      icon: Users,
      title: t("landing.flowBatchTitle"),
    },
    {
      body: t("landing.flowRequestBody"),
      href: "/pay",
      icon: ReceiptText,
      title: t("landing.flowRequestTitle"),
    },
    {
      body: t("landing.flowRecureBody"),
      href: "/swiftRecurepay",
      icon: CalendarClock,
      title: t("landing.flowRecureTitle"),
    },
  ];
  const demos = [
    {
      description: t("landing.demoRoutingBody"),
      stat: t("landing.demoRoutingStat"),
      title: t("landing.demoRoutingTitle"),
    },
    {
      description: t("landing.demoBatchBody"),
      stat: t("landing.demoBatchStat"),
      title: t("landing.demoBatchTitle"),
    },
    {
      description: t("landing.demoRequestBody"),
      stat: t("landing.demoRequestStat"),
      title: t("landing.demoRequestTitle"),
    },
    {
      description: t("landing.demoAutoBody"),
      stat: t("landing.demoAutoStat"),
      title: t("landing.demoAutoTitle"),
    },
  ];
  const howItWorksSteps = [
    {
      detail: t("landing.howStep1Detail"),
      label: t("landing.howStep1Label"),
      step: "01",
    },
    {
      detail: t("landing.howStep2Detail"),
      label: t("landing.howStep2Label"),
      step: "02",
    },
    {
      detail: t("landing.howStep3Detail"),
      label: t("landing.howStep3Label"),
      step: "03",
    },
  ];
  const faqItems = [
    { answer: t("landing.faq1A"), question: t("landing.faq1Q") },
    { answer: t("landing.faq2A"), question: t("landing.faq2Q") },
    { answer: t("landing.faq3A"), question: t("landing.faq3Q") },
    { answer: t("landing.faq4A"), question: t("landing.faq4Q") },
    { answer: t("landing.faq5A"), question: t("landing.faq5Q") },
    { answer: t("landing.faq6A"), question: t("landing.faq6Q") },
  ];
  const whyItems = [
    {
      body: t("landing.whyStableBody"),
      icon: CircleDollarSign,
      title: t("landing.whyStableTitle"),
    },
    {
      body: t("landing.whyUnifiedBody"),
      icon: Layers,
      title: t("landing.whyUnifiedTitle"),
    },
    {
      body: t("landing.whyTrustBody"),
      icon: ShieldCheck,
      title: t("landing.whyTrustTitle"),
    },
  ];
  const trustItems = [
    {
      body: t("landing.trustNoncustodialBody"),
      icon: Fingerprint,
      link: null as string | null,
      linkLabel: null as string | null,
      title: t("landing.trustNoncustodialTitle"),
    },
    {
      body: t("landing.trustVerifiedBody"),
      icon: FileCheck2,
      link: "https://testnet.arcscan.app",
      linkLabel: t("landing.trustVerifiedLink"),
      title: t("landing.trustVerifiedTitle"),
    },
    {
      body: t("landing.trustTestnetBody"),
      icon: FlaskConical,
      link: null,
      linkLabel: null,
      title: t("landing.trustTestnetTitle"),
    },
  ];

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
          <p className="section-eyebrow">{t("landing.productEyebrow")}</p>
          <h2 className="section-title">{t("landing.productTitle")}</h2>
          <p className="section-copy">{t("landing.productCopy")}</p>
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
                    {t("common.explore")}
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
          <p className="section-eyebrow">{t("landing.demosEyebrow")}</p>
          <h2 className="section-title">{t("landing.demosTitle")}</h2>
          <p className="section-copy">{t("landing.demosCopy")}</p>
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
            <p className="section-eyebrow">{t("landing.whyEyebrow")}</p>
            <h2 className="section-title">{t("landing.whyTitle")}</h2>
            <p className="section-copy">{t("landing.whyCopy")}</p>
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
          <p className="section-eyebrow">{t("landing.howEyebrow")}</p>
          <h2 className="section-title">{t("landing.howTitle")}</h2>
          <p className="section-copy">{t("landing.howCopy")}</p>
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
          <p className="section-eyebrow">{t("landing.trustEyebrow")}</p>
          <h2 className="section-title">{t("landing.trustTitle")}</h2>
          <p className="section-copy">{t("landing.trustCopy")}</p>
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
          <p className="section-eyebrow">{t("landing.faqEyebrow")}</p>
          <h2 className="section-title">{t("landing.faqTitle")}</h2>
          <p className="section-copy">{t("landing.faqCopy")}</p>
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
            <p className="section-eyebrow">{t("landing.ctaEyebrow")}</p>
            <h2>{t("landing.ctaTitle")}</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 sm:text-base">
              {t("landing.ctaCopy")}
            </p>
            <ul className="marketing-cta-points">
              <li>{t("landing.ctaPoint1")}</li>
              <li>{t("landing.ctaPoint2")}</li>
              <li>{t("landing.ctaPoint3")}</li>
            </ul>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <LaunchAppLink className="hero-launch-btn">
                {t("common.openSwiftPay")}
                <ArrowRight className="h-4 w-4" />
              </LaunchAppLink>
            </div>
          </div>
          <div className="marketing-cta-media">
            <img
              alt={t("landing.ctaImageAlt")}
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
              aria-label={t("landing.closeSignIn")}
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
