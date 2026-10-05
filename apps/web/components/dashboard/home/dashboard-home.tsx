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
import { useRef, useState, type ReactNode } from "react";

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
  const shown = services.filter((service) => !service.business || isBusiness);

  return (
    <div className="dh">
      <header className="dh-hello">
        <p className="dh-hello-small">{greeting()},</p>
        <p className="dh-hello-name">{greetingName ?? "Welcome to SwiftPay"}</p>
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

        {!isConnected ? (
          <p className="dh-amount">
            <span className="dh-amount-quiet">Connect a wallet</span>
          </p>
        ) : isLoading ? (
          <p className="dh-amount">
            <span className="dh-amount-skeleton" />
          </p>
        ) : (
          <BalanceWheel
            hidden={hideBalance}
            rows={[
              {
                amount: tokens.find((token) => token.symbol === "USDC")?.amount ?? "0.00",
                key: "USDC",
                label: "USDC",
                unit: "USDC",
              },
              { amount: balanceLabel, key: "all", label: "All", unit: currency },
              {
                amount: tokens.find((token) => token.symbol === "EURC")?.amount ?? "0.00",
                key: "EURC",
                label: "EURC",
                unit: "EURC",
              },
            ]}
          />
        )}

        {isConnected ? (
          <p className={cn("dh-change", `is-${trend}`)}>
            {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
            {hideBalance ? "••••" : changeLabel}
          </p>
        ) : null}

        {isConnected && tokens.length > 1 ? (
          <div aria-hidden className="dh-split">
            {tokens.map((token) => (
              <span data-symbol={token.symbol} key={token.symbol} style={{ flexGrow: Math.max(token.share, 0.5) }} />
            ))}
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

type WheelRow = { amount: string; key: string; label: string; unit: string };

/**
 * The balance as a wheel: All in the middle, each coin above and below,
 * blurred until chosen. Tap a row, swipe, or use the arrow keys.
 */
function BalanceWheel({ hidden, rows }: { hidden: boolean; rows: WheelRow[] }) {
  const [index, setIndex] = useState(1);
  const startY = useRef<number | null>(null);
  const move = (step: number) => setIndex((current) => Math.min(rows.length - 1, Math.max(0, current + step)));

  return (
    <div
      aria-label="Balance by currency"
      className="dh-wheel"
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        }
      }}
      onPointerDown={(event) => {
        startY.current = event.clientY;
      }}
      onPointerUp={(event) => {
        if (startY.current === null) return;
        const delta = event.clientY - startY.current;
        startY.current = null;
        if (Math.abs(delta) > 24) move(delta < 0 ? 1 : -1);
      }}
      role="listbox"
      tabIndex={0}
    >
      {rows.map((row, rowIndex) => {
        const offset = rowIndex - index;
        const [whole, cents] = splitAmount(row.amount);
        return (
          <button
            aria-selected={offset === 0}
            className="dh-wheel-row"
            data-offset={Math.max(-1, Math.min(1, offset))}
            hidden={Math.abs(offset) > 1}
            key={row.key}
            onClick={() => setIndex(rowIndex)}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span className="dh-wheel-label">{row.label}</span>
            <span className="dh-wheel-amount">
              {hidden ? (
                "••••••"
              ) : (
                <>
                  {whole}
                  <small>{cents}</small>
                </>
              )}
              <em>{row.unit}</em>
            </span>
          </button>
        );
      })}
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
