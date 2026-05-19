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
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[560px]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex items-center justify-between py-3">
          <Link className="flex min-w-0 items-center gap-3" href="/">
            <BrandMark className="h-16 w-16 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-2xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="hidden text-xs font-medium text-muted sm:block">
                Stablecoin payments on Arc
              </p>
            </div>
          </Link>

          <Link
            className="font-ui inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(18,11,32,0.16)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
            href="/dashboard"
          >
            Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[0.95fr_0.7fr] lg:py-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lavender-200 bg-white/80 px-3 py-1 text-xs font-semibold text-swift-700 shadow-sm">
              <Zap className="h-3.5 w-3.5" />
              EURC and USDC payments
            </div>
            <h1 className="font-heading max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-ink sm:text-6xl lg:text-7xl">
              Payments should feel direct, calm, and complete.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              SwiftPay is a stablecoin payment platform for people who need to
              send, receive, and rebalance money without turning every action
              into a contract inspection task.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="font-ui inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-swift-600 to-swift-700 px-5 text-sm font-semibold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(66,17,143,0.32)] active:translate-y-0"
                href="/dashboard"
              >
                Start a payment
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                className="font-ui inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-5 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0"
                href="#why"
              >
                Why SwiftPay
              </a>
            </div>
          </div>

          <aside className="rounded-lg border border-white/80 bg-gradient-to-br from-white via-white to-lavender-50/70 p-6 shadow-[0_24px_70px_rgba(66,17,143,0.13)] ring-1 ring-white/75 backdrop-blur-xl">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-swift-700">
              SwiftPay promise
            </p>
            <p className="font-heading mt-5 text-2xl font-semibold leading-snug text-ink">
              A wallet-native payment desk that keeps the business action in
              front: who gets paid, in which currency, and where the receipt
              lives.
            </p>
            <div className="mt-6 grid gap-3">
              {[
                ["Currency", "EURC and USDC"],
                ["Network", "Arc Testnet"],
                ["Proof", "ArcScan receipts"],
              ].map(([label, value]) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-lavender-100 bg-white/80 px-4 py-3 shadow-sm"
                  key={label}
                >
                  <span className="text-sm font-semibold text-muted">
                    {label}
                  </span>
                  <span className="text-sm font-bold text-ink">{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-3" id="why">
          {reasons.map((reason) => {
            const Icon = reason.icon;

            return (
              <article
                className="rounded-lg border border-lavender-100 bg-gradient-to-br from-white to-lavender-50/70 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_14px_30px_rgba(66,17,143,0.10)]"
                key={reason.title}
              >
                <Icon className="mb-5 h-5 w-5 text-swift-600" />
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

        <section className="grid gap-6 rounded-lg border border-white/80 bg-gradient-to-br from-white via-white to-lavender-50/70 p-6 shadow-[0_24px_70px_rgba(66,17,143,0.11)] ring-1 ring-white/75 backdrop-blur-xl lg:grid-cols-[0.8fr_1fr]">
          <div>
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white">
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
                className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-lg border border-lavender-100 bg-white/80 px-4 py-4 shadow-sm"
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
