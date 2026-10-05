"use client";

import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Briefcase,
  ChartNoAxesColumn,
  Eye,
  EyeOff,
  FileText,
  Gift,
  PiggyBank,
  QrCode,
  Send,
  Store,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { TokenIcon } from "@/components/token-icon";
import { checkoutEnabled } from "@/lib/checkout/flag";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { cn } from "@/lib/utils";

import "./dashboard-home.css";

export type HomeToken = { symbol: ArcTokenSymbol; amount: string; share: number };

function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "1,234.56" → ["1,234", ".56"]: the cents sit smaller, like a bank card. */
function splitAmount(label: string) {
  const match = label.match(/^(.*?)([.,]\d{1,2})$/);
  return match ? [match[1], match[2]] : [label, ""];
}

const services: Array<{ business?: boolean; href: string; icon: LucideIcon; label: string }> = [
  { href: "/save", icon: PiggyBank, label: "Save" },
  { href: "/earn", icon: TrendingUp, label: "Earn" },
  { href: "/circle", icon: UsersRound, label: "Circle" },
  { href: "/insights", icon: ChartNoAxesColumn, label: "Insights" },
  { href: "/referral", icon: Gift, label: "Invite" },
  { business: true, href: "/business", icon: Briefcase, label: "Overview" },
  { business: true, href: "/business/invoices", icon: FileText, label: "Invoices" },
  { business: true, href: "/business/payroll", icon: Banknote, label: "Payroll" },
  ...(checkoutEnabled ? [{ business: true, href: "/business/checkout", icon: Store, label: "Checkout" }] : []),
];

/**
 * The dashboard, quiet and premium: a greeting, one dark balance card that
 * carries the four everyday actions, this week in two numbers, the services
 * as a grid, then transactions and the rest.
 */
export function DashboardHome({
  avatarUrl,
  balanceLabel,
  banners,
  changeLabel,
  currency,
  earn,
  extras,
  greetingName,
  hideBalance,
  isBusiness,
  isConnected,
  isLoading,
  moneyIn,
  moneyOut,
  onToggleHide,
  tokens,
  transactions,
  trend,
}: {
  avatarUrl?: string | null;
  balanceLabel: string;
  /** Treasury warnings, the install prompt and the like. */
  banners?: ReactNode;
  changeLabel: string;
  currency: string;
  earn?: ReactNode;
  /** Promos, Circle invites. */
  extras?: ReactNode;
  greetingName: string | null;
  hideBalance: boolean;
  isBusiness: boolean;
  isConnected: boolean;
  isLoading: boolean;
  moneyIn: string;
  moneyOut: string;
  onToggleHide: () => void;
  tokens: HomeToken[];
  transactions: ReactNode;
  trend: "up" | "down" | "flat";
}) {
  const [whole, cents] = splitAmount(balanceLabel);
  const shown = services.filter((service) => !service.business || isBusiness);

  return (
    <div className="dh">
      <header className="dh-hello">
        <span aria-hidden className="dh-avatar">
          {avatarUrl ? <img alt="" src={avatarUrl} /> : (greetingName ?? "S").replace(/^@/, "").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="dh-hello-small">{greeting()},</p>
          <p className="dh-hello-name">{greetingName ?? "Welcome to SwiftPay"}</p>
        </div>
      </header>

      {/* The one card that matters */}
      <section aria-label="Balance" className="dh-card">
        <span aria-hidden className="dh-card-glow" />
        <span aria-hidden className="dh-card-sheen" />
        <div className="dh-card-top">
          <span className="dh-card-label">
            {isBusiness ? "Business balance" : "Total balance"} · {currency}
          </span>
          <button
            aria-label={hideBalance ? "Show balance" : "Hide balance"}
            className="dh-eye"
            onClick={onToggleHide}
            type="button"
          >
            {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <p className="dh-amount" aria-live="polite">
          {!isConnected ? (
            <span className="dh-amount-quiet">Connect a wallet</span>
          ) : isLoading ? (
            <span className="dh-amount-skeleton" />
          ) : hideBalance ? (
            "••••••"
          ) : (
            <>
              {whole}
              <small>{cents}</small>
            </>
          )}
        </p>

        {isConnected ? (
          <p className={cn("dh-change", `is-${trend}`)}>
            {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
            {hideBalance ? "••••" : changeLabel}
          </p>
        ) : null}

        {isConnected && tokens.length > 0 ? (
          <div className="dh-tokens">
            <div aria-hidden className="dh-split">
              {tokens.map((token) => (
                <span data-symbol={token.symbol} key={token.symbol} style={{ flexGrow: Math.max(token.share, 0.5) }} />
              ))}
            </div>
            <div className="dh-token-row">
              {tokens.map((token) => (
                <span className="dh-token" key={token.symbol}>
                  <TokenIcon className="h-4 w-4" symbol={token.symbol} />
                  {hideBalance ? "••••" : token.amount}
                  <em>{token.symbol}</em>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <nav aria-label="Money actions" className="dh-actions">
          <Action href="/deposit" icon={ArrowDownToLine} label="Add money" />
          <Action href="/send" icon={Send} label="Send" />
          <Action href="/pay" icon={QrCode} label="Request" />
          <Action href="/swap" icon={ArrowLeftRight} label="Swap" />
        </nav>
      </section>

      {banners}

      {/* This week, in two numbers */}
      <Link className="dh-week" href="/insights">
        <span className="dh-week-tile">
          <span className="dh-week-icon is-in">
            <ArrowDownLeft className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="dh-week-label">In · 7 days</span>
            <span className="dh-week-value">{hideBalance ? "••••" : moneyIn}</span>
          </span>
        </span>
        <span aria-hidden className="dh-week-rule" />
        <span className="dh-week-tile">
          <span className="dh-week-icon is-out">
            <ArrowUpRight className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="dh-week-label">Out · 7 days</span>
            <span className="dh-week-value">{hideBalance ? "••••" : moneyOut}</span>
          </span>
        </span>
      </Link>

      <section aria-labelledby="dh-services" className="dh-section">
        <h2 className="dh-section-title" id="dh-services">
          Services
        </h2>
        <nav className="dh-services">
          {shown.map((service) => (
            <Link className="dh-service" href={service.href} key={service.href}>
              <span className="dh-service-icon">
                <service.icon className="h-5 w-5" />
              </span>
              {service.label}
            </Link>
          ))}
        </nav>
      </section>

      {earn}

      {transactions}

      {extras}
    </div>
  );
}

function Action({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link className="dh-action" href={href}>
      <span className="dh-action-icon">
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </Link>
  );
}
