import {
  ArrowRight,
  CircleDollarSign,
  Globe2,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { CircleGoogleLogin } from "@/components/circle-google-login";
import { PlatformNav } from "@/components/platform-nav";
import { ProfileMenu } from "@/components/profile-menu";
import { SettingsButton } from "@/components/settings-button";

const reasons: Array<{ title: string; body: string; icon: LucideIcon }> = [
  {
    title: "Built for real payments",
    body: "SwiftPay is designed around the simple jobs people repeat every day: pay a wallet, request funds, confirm a transaction, and keep moving.",
    icon: Wallet,
  },
  {
    title: "Stable by default",
    body: "Arc Testnet uses stablecoin rails, so the experience feels closer to digital money than speculative crypto. SwiftPay puts EURC and USDC where users expect them.",
    icon: CircleDollarSign,
  },
  {
    title: "Clear verification",
    body: "Each payment can be checked on ArcScan without exposing contract internals inside the product. The platform keeps the interface focused on the people paying and receiving.",
    icon: ReceiptText,
  },
];

const steps = [
  "Connect a wallet on Arc Testnet.",
  "Choose EURC or USDC and enter the recipient.",
  "Confirm the payment, receive by QR, or swap balances when needed.",
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[560px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="surface-panel relative z-40 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link className="flex min-w-0 items-center gap-3 justify-self-start" href="/">
            <BrandMark className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="truncate text-sm font-semibold text-muted">
                Stablecoin payments on Arc
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 justify-self-start lg:justify-self-end">
            <Link
              className="font-ui hidden h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.34)] active:translate-y-0 sm:inline-flex"
              href="/dashboard"
            >
              Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <SettingsButton />
            <ProfileMenu />
          </div>
        </header>

        <div className="relative z-20 flex justify-center">
          <PlatformNav />
        </div>

        <section className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-stretch lg:py-10">
          <div className="surface-panel p-5 sm:p-8 lg:p-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lavender-200 bg-white/80 px-3 py-2 text-xs font-bold text-swift-700 shadow-sm">
              <Zap className="h-3.5 w-3.5" />
              EURC and USDC payments
            </div>
            <h1 className="font-heading max-w-4xl text-4xl font-semibold leading-[1.04] tracking-normal text-ink sm:text-6xl lg:text-7xl">
              Payments should feel direct, calm, and complete.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
              SwiftPay is a stablecoin payment platform for people who need to
              send, receive, and rebalance money without turning every action
              into a contract inspection task.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="font-ui inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.32)] active:translate-y-0"
                href="/dashboard"
              >
                Start a payment
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                className="font-ui inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-5 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
                href="#why"
              >
                Why SwiftPay
              </a>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Currency", "EURC and USDC"],
                ["Network", "Arc Testnet"],
                ["Proof", "ArcScan receipts"],
              ].map(([label, value]) => (
                <div className="surface-card px-4 py-3" key={label}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-bold text-ink">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <CircleGoogleLogin />
        </section>

        <section className="grid gap-4 md:grid-cols-3" id="why">
          {reasons.map((reason) => {
            const Icon = reason.icon;

            return (
              <article
                className="surface-card p-5 transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_14px_30px_rgba(66,17,143,0.10)]"
                key={reason.title}
              >
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-heading text-lg font-semibold text-ink">
                  {reason.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {reason.body}
                </p>
              </article>
            );
          })}
        </section>

        <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white shadow-[0_14px_30px_rgba(18,11,32,0.18)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="font-heading text-3xl font-semibold tracking-normal text-ink">
              How SwiftPay works
            </h2>
            <p className="mt-3 text-base leading-7 text-muted">
              SwiftPay uses connected wallets and Arc stablecoin rails. The user
              decides the recipient and asset, the wallet signs the action, and
              the dashboard keeps the payment state readable.
            </p>
          </div>

          <div className="grid gap-3">
            {steps.map((step, index) => (
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
        </section>

        <footer className="flex flex-col gap-3 pb-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-swift-600" />
            <span>Designed for stablecoin payment workflows.</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-swift-600" />
            <span>Built on Arc Testnet.</span>
          </div>
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-swift-600" />
            <span>Wallet-signed actions.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
