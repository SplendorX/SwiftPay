"use client";

import Link from "next/link";

import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";

const chart = [
  42, 48, 45, 52, 58, 55, 63, 70, 66, 74, 80, 78, 86, 92,
];

export function DashboardPreview() {
  return (
    <div className="preview-panel dashboard-live-preview">
      <div className="preview-toolbar">
        <span className="preview-dot preview-dot-red" />
        <span className="preview-dot preview-dot-amber" />
        <span className="preview-dot preview-dot-green" />
        <span className="ml-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          SwiftPay · Dashboard
        </span>
        <Badge className="ml-auto text-[10px]" variant="secondary">
          Live
        </Badge>
      </div>

      <div className="dashboard-stage">
        <section className="section-panel dashboard-stage-balances">
          <p className="dashboard-greeting">Welcome</p>
          <h2 className="section-title dashboard-funds-title">Your funds, ready</h2>

          <article className="portfolio-value-board dashboard-stage-portfolio relative overflow-hidden border border-border p-4">
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Portfolio value
                </p>
                <p className="mt-1 font-heading text-3xl font-semibold tracking-tight">
                  $12,840.50
                </p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                +$186.20
              </span>
            </div>
            <div className="relative z-10 mt-3 flex h-14 items-end gap-1">
              {chart.map((height, index) => (
                <span
                  className="min-w-0 flex-1 rounded-t-sm bg-cyan-400/80"
                  key={`${height}-${index}`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </article>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                { amount: "8,420.00 USDC", symbol: "USDC" as const, active: true },
                { amount: "4,018.50 EURC", symbol: "EURC" as const, active: false },
              ]
            ).map((token) => (
              <div className="surface-card p-3 text-left" key={token.symbol}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TokenIcon
                      className="h-8 w-8 rounded-full shadow-sm"
                      symbol={token.symbol}
                    />
                    <p className="eyebrow text-[0.62rem]">{token.symbol} BALANCE</p>
                  </div>
                  <span
                    className={`soft-pill ${token.active ? "soft-pill-live" : ""}`}
                  >
                    {token.active ? "Active" : "Select"}
                  </span>
                </div>
                <p className="mt-4 font-heading text-xl font-semibold tracking-tight">
                  {token.amount}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Link
        aria-label="Open the SwiftPay dashboard"
        className="dashboard-live-preview-hit"
        href="/dashboard"
      />
    </div>
  );
}
