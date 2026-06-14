"use client";

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  Landmark,
  Search,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { FadeUp, Stagger, StaggerItem } from "@/components/design/motion";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const quickStartSteps = [
  "Connect with a Circle wallet or an external wallet.",
  "Confirm the wallet is operating on Arc Testnet.",
  "Choose USDC or EURC for payment, request, batch, swap, or private claim-code workflows.",
  "Verify submitted transactions from the dashboard receipt and ArcScan links.",
];

const productAreas: Array<{
  body: string;
  href: string;
  icon: LucideIcon;
  title: string;
}> = [
  {
    body: "Send stablecoins, receive payment links, review balances, and export transaction receipts.",
    href: "/dashboard",
    icon: BookOpen,
    title: "Dashboard",
  },
  {
    body: "Build a payment request URL with recipient, amount, token, and optional memo fields.",
    href: "/pay",
    icon: FileText,
    title: "Payment requests",
  },
  {
    body: "Convert between supported stablecoin balances through Circle-powered swap routes.",
    href: "/swap",
    icon: Zap,
    title: "Swap",
  },
  {
    body: "Send one token to up to 500 recipients through SwiftBatch with fee routing.",
    href: "/swiftBatch",
    icon: Landmark,
    title: "Batch settlement",
  },
  {
    body: "Create private funded claim codes, manage payroll folders, and redeem receiver claims.",
    href: "/privSwiftPay",
    icon: ShieldCheck,
    title: "PrivSwiftPay",
  },
];

const securityNotes = [
  "Wallets sign each payment, swap, and escrow action before funds move.",
  "Private payment claim codes are scoped to the intended receiver wallet.",
  "Recent private-send and payroll records are stored per active wallet profile.",
  "ArcScan links are used for transaction verification and receipt context.",
];

const environmentRows = [
  ["Network", "Arc Testnet"],
  ["Primary assets", "USDC and EURC"],
  ["Token precision", "6 decimals"],
  ["Wallet options", "Circle wallet and external wallet"],
] as const;

const apiExamples = [
  {
    title: "Start wallet session",
    code: `POST /api/auth/wallet\n{ "action": "challenge", "ownerWallet": "0x..." }`,
  },
  {
    title: "Fetch beneficiaries",
    code: `GET /api/beneficiaries\nAuthorization: wallet session cookie`,
  },
];

export function DocsPageContent() {
  const [query, setQuery] = useState("");

  const filteredAreas = useMemo(
    () =>
      productAreas.filter(
        (area) =>
          area.title.toLowerCase().includes(query.toLowerCase()) ||
          area.body.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  return (
    <MarketingShell>
        <section className="marketing-section section-panel lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8">
          <FadeUp>
            <Badge className="mb-4" variant="secondary">
              <BookOpen className="mr-1 h-3 w-3" />
              Stripe-style product docs
            </Badge>
            <h1 className="font-heading max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Payment infrastructure documentation
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Everything you need to launch stablecoin payment workflows on Arc
              Testnet — wallet access, transfers, requests, swaps, and privacy
              modules.
            </p>
            <div className="relative mt-6 max-w-md">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search docs..."
                value={query}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard">
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href="https://developers.circle.com/" rel="noreferrer" target="_blank">
                  Circle docs
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </FadeUp>

          <div className="mt-6 grid gap-3 lg:mt-0">
            {environmentRows.map(([label, value]) => (
              <div className="trust-pill" key={label}>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                  {label}
                </p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="feature-card">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Quick start</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {quickStartSteps.map((step, index) => (
                <div className="step-card" key={step}>
                  <span className="step-index">{index + 1}</span>
                  <p className="text-sm font-medium">{step}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Stagger className="grid gap-4 sm:grid-cols-2">
            {filteredAreas.map((area) => {
              const Icon = area.icon;
              return (
                <StaggerItem key={area.title}>
                  <Link className="feature-card block h-full rounded-xl border p-5" href={area.href}>
                    <div className="feature-icon mb-4">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-heading text-lg font-semibold">{area.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{area.body}</p>
                  </Link>
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {apiExamples.map((example) => (
            <Card className="feature-card" key={example.title}>
              <CardHeader>
                <CardTitle className="text-base">{example.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs leading-6">
                  {example.code}
                </pre>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Card className="feature-card">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Security model</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {securityNotes.map((note) => (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3" key={note}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-sm font-medium">{note}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="feature-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Supported assets</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                ["USDC", "USD Coin"],
                ["EURC", "Euro Coin"],
              ].map(([symbol, name]) => (
                <div className="flex items-center gap-4 rounded-lg border border-border p-3" key={symbol}>
                  <TokenIcon
                    className="h-10 w-10 shrink-0 rounded-full"
                    symbol={symbol as "USDC" | "EURC"}
                  />
                  <div>
                    <p className="text-sm font-bold">{symbol}</p>
                    <p className="text-xs text-muted-foreground">{name}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
    </MarketingShell>
  );
}