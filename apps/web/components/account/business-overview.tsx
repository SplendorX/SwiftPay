"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAccountContext } from "@/components/account/account-provider";
import { Button } from "@/components/ui/button";
import { fetchBusinessOverview } from "@/lib/account/client";
import { formatMoney, profileCompletionPercent } from "@/lib/account/money";
import type { InvoiceRecord, InvoiceSummary } from "@/lib/account/types";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

function formatStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ");
}

export function BusinessOverview() {
  const { account, ownerWallet, profile } = useAccountContext();
  const { address, isConnected } = usePlatformWallet();
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerWallet) return;
    void fetchBusinessOverview(ownerWallet)
      .then((payload) => {
        setSummary(payload.summary);
        setInvoices(payload.invoices);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load overview."),
      );
  }, [ownerWallet]);

  if (account && account.account_type !== "BUSINESS") {
    return (
      <div className="section-panel p-8">
        <h2 className="font-heading text-2xl">Business Overview</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Overview is available after you upgrade this account to Business.
        </p>
        <Button asChild className="mt-5">
          <Link href="/settings#account-type">Upgrade to Business</Link>
        </Button>
      </div>
    );
  }

  const completion = profileCompletionPercent(profile);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Professional overview</p>
          <h2 className="font-heading text-3xl">{profile?.business_name ?? account?.username}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            @{account?.username}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/business/invoices">Create invoice</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard#send">Send</Link>
          </Button>
        </div>
      </div>

      {completion.percent < 100 ? (
        <div className="section-panel flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-semibold">Business profile {completion.percent}% complete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Missing: {completion.missing.join(", ") || "none"}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/business/profile">Complete profile</Link>
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Wallet" value={isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"} />
        <Metric label="Total invoiced" value={formatMoney(summary?.totalInvoiced ?? 0)} />
        <Metric label="Paid invoices" value={formatMoney(summary?.paid ?? 0)} />
        <Metric label="Outstanding" value={formatMoney((summary?.pending ?? 0) + (summary?.overdue ?? 0))} />
      </div>

      <section className="section-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-lg">Recent invoices</h3>
          <Button asChild size="sm" variant="ghost">
            <Link href="/business/invoices">View invoices</Link>
          </Button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your business activity will appear here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((invoice) => (
              <li className="flex items-center justify-between py-3 text-sm" key={invoice.id}>
                <div>
                  <p className="font-medium">{invoice.invoice_number}</p>
                  <p className="text-muted-foreground">
                    {invoice.customer_name || "Customer"} · {formatStatus(invoice.status)}
                  </p>
                </div>
                <p className="font-semibold">{formatMoney(invoice.total, invoice.currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="section-panel p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-xl">{value}</p>
    </div>
  );
}
