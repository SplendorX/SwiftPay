import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  KeyRound,
  Landmark,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { PlatformPageBody } from "@/components/platform-page-body";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { TokenIcon } from "@/components/token-icon";

const quickStartSteps = [
  "Connect with a Circle embedded wallet or an external wallet.",
  "Confirm the wallet is operating on Arc Testnet.",
  "Choose USDC or EURC for payment, request, swap, or private claim-code workflows.",
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
    icon: Wallet,
    title: "Dashboard",
  },
  {
    body: "Build a payment request URL with recipient, amount, token, and optional memo fields.",
    href: "/pay",
    icon: ReceiptText,
    title: "Payrequest",
  },
  {
    body: "Convert between supported stablecoin balances through Circle-powered swap routes.",
    href: "/swap",
    icon: RefreshCw,
    title: "Swap",
  },
  {
    body: "Create private funded claim codes, manage payroll folders, and redeem receiver claims.",
    href: "/privSwiftPay",
    icon: LockKeyhole,
    title: "privSwiftPay",
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
  ["Wallet options", "Circle embedded wallet and external wallet"],
];

function DocsPageContent() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
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
                Platform docs
              </p>
            </div>
          </Link>

          <PlatformProfileControls />
        </header>

        <PlatformPageBody>
        <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-stretch">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lavender-200 bg-white/80 px-3 py-2 text-xs font-bold text-swift-700 shadow-sm">
              <BookOpen className="h-3.5 w-3.5" />
              SwiftPay Documentation
            </div>
            <h1 className="font-heading max-w-4xl text-3xl font-semibold leading-tight tracking-normal text-ink sm:text-5xl">
              Professional payment workflows for USDC and EURC on Arc.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              SwiftPay combines wallet access, stablecoin transfers, payment
              requests, swaps, private claim codes, payroll folders, and receipt
              verification in one operational platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 active:translate-y-0"
                href="/dashboard"
              >
                Open dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
                href="https://developers.circle.com/"
                rel="noreferrer"
                target="_blank"
              >
                Circle docs
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="grid gap-3">
            {environmentRows.map(([label, value]) => (
              <div className="surface-card px-4 py-4" key={label}>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                  {label}
                </p>
                <p className="mt-2 text-sm font-black text-ink">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="surface-panel p-5 sm:p-6">
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white shadow-[0_14px_30px_rgba(18,11,32,0.18)]">
              <Zap className="h-5 w-5" />
            </div>
            <p className="eyebrow">Quick start</p>
            <h2 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink">
              Launch a stablecoin payment session
            </h2>
            <div className="mt-5 grid gap-3">
              {quickStartSteps.map((step, index) => (
                <div
                  className="surface-card grid grid-cols-[auto_1fr] items-center gap-4 px-4 py-4"
                  key={step}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sm font-bold text-swift-700 shadow-sm">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold leading-6 text-ink">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {productAreas.map((area) => {
              const Icon = area.icon;

              return (
                <Link
                  className="surface-card group flex min-h-[13rem] flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_14px_30px_rgba(66,17,143,0.10)]"
                  href={area.href}
                  key={area.title}
                >
                  <div>
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-heading text-lg font-semibold text-ink">
                      {area.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      {area.body}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-swift-700">
                    Open
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="surface-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <p className="eyebrow">Supported assets</p>
            <h2 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink">
              Official Circle token display
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              SwiftPay uses Circle's official token-logo assets for supported
              stablecoins so balances, payment amounts, and request previews
              stay visually consistent across the platform.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["USDC", "USD Coin"],
              ["EURC", "Euro Coin"],
            ].map(([symbol, name]) => (
              <div
                className="surface-card flex items-center gap-4 px-4 py-4"
                key={symbol}
              >
                <TokenIcon
                  className="h-12 w-12 shrink-0 rounded-full shadow-sm"
                  symbol={symbol as "USDC" | "EURC"}
                />
                <div className="min-w-0">
                  <p className="text-sm font-black text-ink">{symbol}</p>
                  <p className="mt-1 text-sm font-semibold text-muted">
                    {name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <div className="surface-panel p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Security model</p>
                <h2 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink">
                  Wallet approval remains the source of authority.
                </h2>
              </div>
              <ShieldCheck className="h-5 w-5 shrink-0 text-swift-600" />
            </div>
            <div className="grid gap-3">
              {securityNotes.map((note) => (
                <div
                  className="flex items-start gap-3 rounded-lg border border-lavender-100 bg-white/75 px-4 py-3"
                  key={note}
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <p className="text-sm font-semibold leading-6 text-ink">
                    {note}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <aside className="surface-panel p-5 sm:p-6">
            <p className="eyebrow">Reference</p>
            <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
              External resources
            </h2>
            <div className="mt-5 grid gap-2">
              {[
                ["Circle Developers", "https://developers.circle.com/"],
                ["Arc Docs", "https://docs.arc.io/"],
                ["Circle Faucet", "https://faucet.circle.com/"],
              ].map(([label, href]) => (
                <a
                  className="inline-flex min-h-11 items-center justify-between gap-3 rounded-lg border border-lavender-100 bg-white/75 px-3 py-2 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:text-swift-700"
                  href={href}
                  key={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="inline-flex min-w-0 items-center gap-3">
                    {label === "Circle Faucet" ? (
                      <Landmark className="h-4 w-4 shrink-0" />
                    ) : label === "Arc Docs" ? (
                      <KeyRound className="h-4 w-4 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{label}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted" />
                </a>
              ))}
            </div>
          </aside>
        </section>
        </PlatformPageBody>
      </div>
    </main>
  );
}

export default function DocsPage() {
  return <DocsPageContent />;
}
