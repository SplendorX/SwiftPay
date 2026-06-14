"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  MessageSquareText,
  QrCode,
  ReceiptText,
  Share2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { FadeUp } from "@/components/design/motion";
import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const requestsStorageKey = "swiftpay.payment.requests";

type SavedRequest = {
  amount: string;
  createdAt: string;
  expiresInHours: number;
  id: string;
  link: string;
  note: string;
  status: "active" | "expired";
  token: ArcTokenSymbol;
  wallet: string;
};

type PaymentCollectionHubProps = {
  initialAmount: string;
  initialNote: string;
  initialToken: ArcTokenSymbol;
  initialWalletAddress: string;
};

function isPositiveAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function readSavedRequests(): SavedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(requestsStorageKey);
    return raw ? (JSON.parse(raw) as SavedRequest[]) : [];
  } catch {
    return [];
  }
}

function writeSavedRequests(requests: SavedRequest[]) {
  window.localStorage.setItem(requestsStorageKey, JSON.stringify(requests));
}

export function PaymentCollectionHub({
  initialAmount,
  initialNote,
  initialToken,
  initialWalletAddress,
}: PaymentCollectionHubProps) {
  const [origin, setOrigin] = useState("");
  const [walletAddress, setWalletAddress] = useState(initialWalletAddress);
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);
  const [token, setToken] = useState<ArcTokenSymbol>(initialToken);
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);

  const trimmedWalletAddress = walletAddress.trim();
  const trimmedAmount = amount.trim();
  const trimmedNote = note.trim();
  const isWalletValid = isAddress(trimmedWalletAddress);
  const isAmountValid = isPositiveAmount(trimmedAmount);
  const canGenerateLink = Boolean(origin && isWalletValid && isAmountValid);

  const requestLink = useMemo(() => {
    if (!canGenerateLink) return "";

    const requestUrl = new URL("/dashboard", origin);
    requestUrl.searchParams.set("to", trimmedWalletAddress);
    requestUrl.searchParams.set("amount", trimmedAmount);
    requestUrl.searchParams.set("token", token);
    if (trimmedNote) requestUrl.searchParams.set("memo", trimmedNote);
    return requestUrl.toString();
  }, [canGenerateLink, origin, token, trimmedAmount, trimmedNote, trimmedWalletAddress]);

  const dashboardHref = useMemo(() => {
    const params = new URLSearchParams();
    if (isWalletValid) params.set("to", trimmedWalletAddress);
    if (isAmountValid) params.set("amount", trimmedAmount);
    params.set("token", token);
    if (trimmedNote) params.set("memo", trimmedNote);
    return `/dashboard?${params.toString()}`;
  }, [isAmountValid, isWalletValid, token, trimmedAmount, trimmedNote, trimmedWalletAddress]);

  useEffect(() => {
    setOrigin(window.location.origin);
    setSavedRequests(readSavedRequests());
  }, []);

  useEffect(() => {
    if (!requestLink || !canGenerateLink) return;

    const existing = readSavedRequests().find((item) => item.link === requestLink);
    if (existing) return;

    const nextRequest: SavedRequest = {
      amount: trimmedAmount,
      createdAt: new Date().toISOString(),
      expiresInHours: Number(expiresInHours) || 24,
      id: crypto.randomUUID(),
      link: requestLink,
      note: trimmedNote,
      status: "active",
      token,
      wallet: trimmedWalletAddress,
    };

    const next = [nextRequest, ...readSavedRequests()].slice(0, 12);
    writeSavedRequests(next);
    setSavedRequests(next);
  }, [
    canGenerateLink,
    expiresInHours,
    requestLink,
    token,
    trimmedAmount,
    trimmedNote,
    trimmedWalletAddress,
  ]);

  async function copyValue(value: string, type: "address" | "link") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }

  async function shareRequestLink() {
    if (!requestLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          text: trimmedNote || `Payment request for ${trimmedAmount} ${token}`,
          title: "SwiftPay payment request",
          url: requestLink,
        });
        return;
      }
      await copyValue(requestLink, "link");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const activeCount = savedRequests.filter((r) => r.status === "active").length;

  return (
    <div className="collection-hub">
      <FadeUp className="collection-hub-hero section-panel">
        <Badge className="mb-3" variant="secondary">
          <ReceiptText className="mr-1 h-3 w-3" />
          Payment collection
        </Badge>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Payment collection hub
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Generate payment links, share QR codes, set expiration windows, and
          track open requests — all routing to your dashboard receive flow.
        </p>
        <div className="collection-hub-stats">
          <div className="preview-metric">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              Active requests
            </p>
            <p className="mt-0.5 font-heading text-lg font-semibold">{activeCount}</p>
          </div>
          <div className="preview-metric">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              Network
            </p>
            <p className="mt-0.5 font-heading text-lg font-semibold">Arc</p>
          </div>
          <div className="preview-metric">
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              Assets
            </p>
            <p className="mt-0.5 font-heading text-lg font-semibold">USDC · EURC</p>
          </div>
        </div>
      </FadeUp>

      <div className="collection-hub-grid">
        <section className="section-panel">
          <p className="section-eyebrow">Create request</p>
          <h2 className="section-title">Build a payment link</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">Receiving wallet</span>
              <div className="field-shell flex h-11 items-center gap-2 px-3">
                <Wallet className="h-4 w-4 text-primary" />
                <Input
                  className="border-0 bg-transparent font-mono shadow-none focus-visible:ring-0"
                  onChange={(event) => setWalletAddress(event.target.value)}
                  placeholder="0x…"
                  value={walletAddress}
                />
              </div>
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_12rem_7rem]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Amount</span>
                <div className="field-shell flex h-11 items-center gap-2 px-3">
                  <TokenIcon className="h-5 w-5 rounded-full" symbol={token} />
                  <Input
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    value={amount}
                  />
                </div>
              </label>
              <TokenSelect
                label="Token"
                onChange={setToken}
                size="sm"
                value={token}
              />
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Expires</span>
                <select
                  className="field-shell h-11 bg-background px-3 text-sm font-semibold outline-none"
                  onChange={(event) => setExpiresInHours(event.target.value)}
                  value={expiresInHours}
                >
                  <option value="1">1 hour</option>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">Note (optional)</span>
              <div className="field-shell flex min-h-20 items-start gap-2 px-3 py-3">
                <MessageSquareText className="mt-0.5 h-4 w-4 text-primary" />
                <textarea
                  className="min-h-16 min-w-0 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  maxLength={140}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Invoice, rent, or payment reference"
                  value={note}
                />
              </div>
            </label>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Generated link</span>
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {requestLink || "Enter a valid wallet and amount to generate."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={!requestLink} onClick={() => void copyValue(requestLink, "link")} type="button">
                  {copied === "link" ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "link" ? "Copied" : "Copy link"}
                </Button>
                <Button disabled={!requestLink} onClick={() => void shareRequestLink()} type="button" variant="outline">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
                {canGenerateLink ? (
                  <Button asChild variant="outline">
                    <Link href={dashboardHref}>
                      Preview flow
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <aside className="section-panel">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-eyebrow">QR code</p>
              <h2 className="section-title">Scan to pay</h2>
            </div>
            <QrCode className="h-5 w-5 text-primary" />
          </div>

          <div className="collection-hub-qr">
            {requestLink ? (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl bg-background p-4 shadow-sm"
                initial={{ opacity: 0, scale: 0.95 }}
              >
                <LazyQRCodeSVG
                  bgColor="transparent"
                  fgColor="currentColor"
                  marginSize={1}
                  size={200}
                  title="SwiftPay payment request"
                  value={requestLink}
                />
              </motion.div>
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                QR preview appears when link is ready
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold">
                {trimmedAmount || "0.00"} {token}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Expires</span>
              <span className="inline-flex items-center gap-1 font-semibold">
                <Clock3 className="h-3.5 w-3.5" />
                {expiresInHours}h
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Chain</span>
              <span className="font-semibold">{arcTestnet.name}</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="section-panel">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow">Request history</p>
            <h2 className="section-title">Recent requests</h2>
          </div>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>

        {savedRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Generated links appear here for quick status tracking.
          </p>
        ) : (
          <div className="collection-hub-requests">
            {savedRequests.map((request) => (
              <article className="collection-hub-request-card" key={request.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {request.amount} {request.token}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {request.wallet}
                    </p>
                    {request.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>
                    ) : null}
                  </div>
                  <Badge variant={request.status === "active" ? "secondary" : "outline"}>
                    {request.status}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void copyValue(request.link, "link")} size="sm" variant="outline">
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      href={
                        request.link.startsWith("http")
                          ? `${new URL(request.link).pathname}${new URL(request.link).search}`
                          : dashboardHref
                      }
                    >
                      Open
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}