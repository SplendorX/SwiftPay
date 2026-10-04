"use client";

import {
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  Plus,
  QrCode,
  Share2,
  Store,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAccountContext } from "@/components/account/account-provider";
import { AmountKeypad } from "@/components/checkout/amount-keypad";
import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { showSuccess } from "@/components/success-popup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, moneyNumber } from "@/lib/account/money";
import {
  cancelChargeClient,
  createChargeClient,
  fetchCharge,
  fetchCharges,
  type MerchantAuth,
} from "@/lib/checkout/client";
import { CHARGE_MAX_AMOUNT, CHARGE_MIN_AMOUNT } from "@/lib/checkout/money-rules";
import type { ChargeStatus, ChargeSummary, ChargeWithPayments } from "@/lib/checkout/types";
import { explorerTxUrl } from "@/lib/onchain-facts";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { cn } from "@/lib/utils";

const POLL_MS = 2_500;

type Tab = "charge" | "storefront";

const statusStyles: Record<ChargeStatus, string> = {
  CANCELLED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  OPEN: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PAID: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

function newIdempotencyKey() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { day: "numeric", hour: "numeric", minute: "2-digit", month: "short" });
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy. Select and copy it instead.");
  }
}

async function shareLink(url: string, title: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      // Dismissed: fall back to copying.
    }
  }
  await copyText(url, "Link");
}

export function MerchantCheckoutHub() {
  const {
    account,
    circleSocialUuid: accountSocialUuid,
    isBusiness,
    loading: accountLoading,
    ownerWallet,
    profile,
  } = useAccountContext();
  const { address, circleSocialUuid: walletSocialUuid } = usePlatformWallet();
  const activeWallet = (ownerWallet || address)?.toLowerCase() ?? null;
  const isBusinessAccount = Boolean(isBusiness || account?.account_type === "BUSINESS");
  const auth = useMemo<MerchantAuth | null>(
    () =>
      activeWallet
        ? { circleSocialUuid: accountSocialUuid || walletSocialUuid || undefined, ownerWallet: activeWallet }
        : null,
    [accountSocialUuid, activeWallet, walletSocialUuid],
  );
  const currency = profile?.currency ?? "USDC";

  const [tab, setTab] = useState<Tab>("charge");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ChargeWithPayments | null>(null);
  const [charges, setCharges] = useState<ChargeWithPayments[]>([]);
  const [summary, setSummary] = useState<ChargeSummary | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const idempotencyKey = useRef(newIdempotencyKey());
  const celebrated = useRef<Set<string>>(new Set());

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loadCharges = useCallback(async () => {
    if (!auth) return;
    try {
      const result = await fetchCharges(auth);
      setCharges(result.charges);
      setSummary(result.summary);
    } catch {
      // The list is secondary; the charge screen still works.
    }
  }, [auth]);

  useEffect(() => {
    if (isBusinessAccount) void loadCharges();
  }, [isBusinessAccount, loadCharges]);

  const activeId = active?.id;
  const activeStatus = active?.status;

  // Watch the charge on screen until it is paid, so the counter sees it live.
  useEffect(() => {
    if (!auth || !activeId || activeStatus !== "OPEN") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchCharge(auth, activeId)
        .then(({ charge }) => setActive((current) => (current?.id === charge.id ? charge : current)))
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, activeStatus, auth]);

  useEffect(() => {
    if (!active || active.status !== "PAID" || celebrated.current.has(active.id)) return;
    celebrated.current.add(active.id);
    const tip = moneyNumber(active.tip_amount);
    showSuccess({
      amount: formatMoney(active.amount_received, active.currency),
      eyebrow: "Checkout",
      explorerUrl: active.payments[0] ? explorerTxUrl(active.payments[0].tx_hash) : undefined,
      subtitle: tip > 0 ? `Including a ${formatMoney(tip, active.currency)} tip` : undefined,
      title: "Payment received",
    });
    void loadCharges();
  }, [active, loadCharges]);

  if (accountLoading && !account) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!accountLoading && !isBusinessAccount) {
    return (
      <div className="section-panel p-8">
        <h2 className="font-heading text-2xl">Checkout</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Business accounts can take in-person payments. Upgrade your account to Business to
          start charging customers.
        </p>
        <Button asChild className="mt-5">
          <Link href="/settings#account-type">Upgrade to Business</Link>
        </Button>
      </div>
    );
  }

  const value = moneyNumber(amount || "0");
  const valid = value >= CHARGE_MIN_AMOUNT && value <= CHARGE_MAX_AMOUNT.MERCHANT;
  const chargeUrl = active && origin ? `${origin}/c/${active.public_id}` : "";
  const storefrontUrl = account?.username && origin ? `${origin}/p/${account.username}` : "";

  async function createActiveCharge() {
    if (!auth || !valid) return;
    setCreating(true);
    setError(null);
    try {
      const { charge } = await createChargeClient(
        auth,
        { amount, currency, note: note.trim() || undefined },
        idempotencyKey.current,
      );
      setActive(charge);
      idempotencyKey.current = newIdempotencyKey();
      void loadCharges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the charge.");
    } finally {
      setCreating(false);
    }
  }

  function resetCharge() {
    setActive(null);
    setAmount("");
    setNote("");
    setError(null);
  }

  async function cancel(charge: ChargeWithPayments) {
    if (!auth) return;
    setCancellingId(charge.id);
    try {
      const { charge: next } = await cancelChargeClient(auth, charge.id);
      setActive((current) => (current?.id === next.id ? next : current));
      void loadCharges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the charge.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="section-panel space-y-5 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 text-sm font-medium">
          {(
            [
              { icon: Plus, id: "charge", label: "New charge" },
              { icon: Store, id: "storefront", label: "Storefront QR" },
            ] as const
          ).map((option) => (
            <button
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 transition-colors",
                tab === option.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              key={option.id}
              onClick={() => setTab(option.id)}
              type="button"
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>

        {tab === "storefront" ? (
          storefrontUrl ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Put this QR on your counter or window. Customers scan it, type the amount, and pay.
              </p>
              <div className="mx-auto w-fit rounded-2xl bg-white p-4">
                <LazyQRCodeSVG size={220} value={storefrontUrl} />
              </div>
              <p className="break-all text-sm font-medium">{storefrontUrl}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => void copyText(storefrontUrl, "Link")} variant="outline">
                  <Copy className="h-4 w-4" />
                  Copy link
                </Button>
                <Button onClick={() => void shareLink(storefrontUrl, `Pay ${profile?.business_name ?? "us"}`)} variant="outline">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set a username in{" "}
              <Link className="font-medium text-primary hover:underline" href="/settings">
                Settings
              </Link>{" "}
              to get a permanent storefront QR.
            </p>
          )
        ) : active ? (
          <div className="space-y-4 text-center">
            {active.status === "PAID" ? (
              <div className="space-y-2 rounded-2xl bg-emerald-500/10 p-6">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-7 w-7" />
                </span>
                <p className="font-heading text-3xl">Paid</p>
                <p className="font-heading text-4xl tabular-nums">
                  {formatMoney(active.amount_received, active.currency)}
                </p>
                {moneyNumber(active.tip_amount) > 0 ? (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    +{formatMoney(active.tip_amount, active.currency)} tip
                  </p>
                ) : null}
              </div>
            ) : active.status === "OPEN" ? (
              <>
                <p className="font-heading text-4xl tabular-nums">
                  {formatMoney(active.amount, active.currency)}
                </p>
                {active.note ? <p className="text-sm text-muted-foreground">{active.note}</p> : null}
                <div className="mx-auto w-fit rounded-2xl bg-white p-4">
                  {chargeUrl ? <LazyQRCodeSVG size={240} value={chargeUrl} /> : null}
                </div>
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {moneyNumber(active.amount_received) > 0
                    ? `Received ${formatMoney(active.amount_received, active.currency)} of ${formatMoney(active.amount, active.currency)}`
                    : active.pending_method
                      ? "Customer is paying…"
                      : "Waiting for the customer to scan"}
                </p>
                <p className="font-mono text-sm tracking-widest">{active.public_id}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => void copyText(chargeUrl, "Link")} variant="outline">
                    <Copy className="h-4 w-4" />
                    Copy link
                  </Button>
                  <Button onClick={() => void shareLink(chargeUrl, "Pay with SwiftPay")} variant="outline">
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                </div>
              </>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                This charge was {active.status.toLowerCase()}.
              </p>
            )}
            <div className="flex gap-2">
              {active.status === "OPEN" && active.payments.length === 0 ? (
                <Button
                  className="flex-1"
                  disabled={cancellingId === active.id}
                  onClick={() => void cancel(active)}
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
              <Button className="flex-1" onClick={resetCharge}>
                <Plus className="h-4 w-4" />
                New charge
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <AmountKeypad currency={currency} disabled={creating} onChange={setAmount} value={amount} />
            <Input
              disabled={creating}
              maxLength={140}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note for the customer (optional)"
              value={note}
            />
            {value > CHARGE_MAX_AMOUNT.MERCHANT ? (
              <p className="text-sm text-destructive">
                The largest charge is {CHARGE_MAX_AMOUNT.MERCHANT.toLocaleString("en-US")}.
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="h-12 w-full text-base"
              disabled={!valid || creating || !auth}
              onClick={() => void createActiveCharge()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Charge {value > 0 ? formatMoney(amount, currency) : ""}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Customers pay with SwiftPay or any wallet on Arc. No fee on what they send you.
            </p>
          </div>
        )}
      </section>

      <section className="section-panel min-w-0 p-5 sm:p-6">
        {summary ? (
          <div className="mb-5 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Paid today", value: String(summary.todayCount) },
              { label: "Volume today", value: formatMoney(summary.todayVolume, currency) },
              { label: "Tips today", value: formatMoney(summary.todayTips, currency) },
            ].map((stat) => (
              <div className="rounded-xl bg-muted/50 px-2 py-3" key={stat.label}>
                <p className="font-heading text-xl tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}
        <h2 className="font-semibold">Recent charges</h2>
        {charges.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Charges you create show up here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {charges.map((charge) => (
              <li className="flex items-center gap-3 py-3" key={charge.id}>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setTab("charge");
                    setActive(charge);
                  }}
                  type="button"
                >
                  <p className="font-medium tabular-nums">
                    {formatMoney(
                      charge.status === "PAID" ? charge.amount_received : charge.amount,
                      charge.currency,
                    )}
                    {charge.status === "PAID" && moneyNumber(charge.tip_amount) > 0 ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        incl. {formatMoney(charge.tip_amount, charge.currency)} tip
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {timeLabel(charge.created_at)} · {charge.public_id}
                    {charge.kind === "STOREFRONT" ? " · storefront" : ""}
                    {charge.note ? ` · ${charge.note}` : ""}
                  </p>
                </button>
                <span
                  className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusStyles[charge.status])}
                >
                  {charge.status.toLowerCase()}
                </span>
                {charge.payments[0] ? (
                  <a
                    aria-label="View transaction"
                    className="text-muted-foreground hover:text-foreground"
                    href={explorerTxUrl(charge.payments[0].tx_hash)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : charge.status === "OPEN" ? (
                  <button
                    aria-label="Cancel charge"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    disabled={cancellingId === charge.id}
                    onClick={() => void cancel(charge)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
