"use client";

import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Link2,
  MessageSquareText,
  QrCode,
  Share2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { TokenIcon } from "@/components/token-icon";
import { recordPlatformPaymentEvent } from "@/lib/platform-analytics";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

type PaymentRequestBuilderProps = {
  initialAmount: string;
  initialNote: string;
  initialToken: ArcTokenSymbol;
  initialWalletAddress: string;
};

function isPositiveAmount(value: string) {
  const amount = Number(value);

  return Number.isFinite(amount) && amount > 0;
}

export function PaymentRequestBuilder({
  initialAmount,
  initialNote,
  initialToken,
  initialWalletAddress,
}: PaymentRequestBuilderProps) {
  const [origin, setOrigin] = useState("");
  const [walletAddress, setWalletAddress] = useState(initialWalletAddress);
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);
  const [copied, setCopied] = useState<"address" | "link" | null>(null);

  const trimmedWalletAddress = walletAddress.trim();
  const trimmedAmount = amount.trim();
  const trimmedNote = note.trim();
  const isWalletValid = isAddress(trimmedWalletAddress);
  const isAmountValid = isPositiveAmount(trimmedAmount);
  const canGenerateLink = Boolean(origin && isWalletValid && isAmountValid);

  const requestLink = useMemo(() => {
    if (!canGenerateLink) {
      return "";
    }

    const requestUrl = new URL("/dashboard", origin);
    requestUrl.searchParams.set("to", trimmedWalletAddress);
    requestUrl.searchParams.set("amount", trimmedAmount);
    requestUrl.searchParams.set("token", initialToken);

    if (trimmedNote) {
      requestUrl.searchParams.set("memo", trimmedNote);
    }

    return requestUrl.toString();
  }, [
    canGenerateLink,
    initialToken,
    origin,
    trimmedAmount,
    trimmedNote,
    trimmedWalletAddress,
  ]);

  const dashboardHref = useMemo(() => {
    const params = new URLSearchParams();

    if (isWalletValid) {
      params.set("to", trimmedWalletAddress);
    }

    if (isAmountValid) {
      params.set("amount", trimmedAmount);
    }

    params.set("token", initialToken);

    if (trimmedNote) {
      params.set("memo", trimmedNote);
    }

    return `/dashboard?${params.toString()}`;
  }, [
    initialToken,
    isAmountValid,
    isWalletValid,
    trimmedAmount,
    trimmedNote,
    trimmedWalletAddress,
  ]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function copyValue(value: string, type: "address" | "link") {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      if (type === "link" && canGenerateLink) {
        recordPlatformPaymentEvent({
          amount: trimmedAmount,
          eventType: "payment_request",
          metadata: {
            action: "copy_link",
            note: trimmedNote,
          },
          token: initialToken,
          walletAddress: trimmedWalletAddress,
        });
      }
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }

  async function shareRequestLink() {
    if (!requestLink) {
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          text: trimmedNote || `Payment request for ${trimmedAmount} ${initialToken}`,
          title: "SwiftPay payment request",
          url: requestLink,
        });
        recordPlatformPaymentEvent({
          amount: trimmedAmount,
          eventType: "payment_request",
          metadata: {
            action: "share_link",
            note: trimmedNote,
          },
          token: initialToken,
          walletAddress: trimmedWalletAddress,
        });
        return;
      }

      await copyValue(requestLink, "link");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="surface-panel p-4 sm:p-6">
        <div className="mb-6">
          <p className="eyebrow">Payrequest</p>
          <h1 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-4xl">
            Generate a receiving link
          </h1>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-ink">
              Wallet address
            </span>
            <div className="field-shell flex h-12 items-center gap-2 px-3">
              <Wallet className="h-4 w-4 shrink-0 text-swift-600" />
              <input
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-ink outline-none placeholder:text-muted"
                onChange={(event) => setWalletAddress(event.target.value)}
                placeholder="0x receiving wallet address"
                spellCheck={false}
                value={walletAddress}
              />
            </div>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-ink">Amount</span>
            <div className="field-shell flex h-12 items-center gap-2 px-3">
              <TokenIcon
                className="h-5 w-5 shrink-0 rounded-full"
                symbol={initialToken}
              />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted"
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                value={amount}
              />
              <span className="text-xs font-black text-muted">
                {initialToken}
              </span>
            </div>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-ink">
              Note optional
            </span>
            <div className="field-shell flex min-h-24 items-start gap-2 px-3 py-3">
              <MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-swift-600" />
              <textarea
                className="min-h-20 min-w-0 flex-1 resize-none bg-transparent text-sm font-medium leading-6 text-ink outline-none placeholder:text-muted"
                maxLength={140}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Invoice, rent, refund, or payment note"
                value={note}
              />
            </div>
          </label>

          <div className="rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-swift-600" />
              <span className="text-sm font-bold text-ink">
                Generated link
              </span>
            </div>
            <p className="min-h-10 break-all text-xs font-bold leading-5 text-swift-700">
              {requestLink || "Enter a valid wallet address and amount."}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(66,17,143,0.18)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
                disabled={!requestLink}
                onClick={() => void copyValue(requestLink, "link")}
                type="button"
              >
                {copied === "link" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied === "link" ? "Copied" : "Copy"}
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-4 text-sm font-bold text-ink transition hover:-translate-y-0.5 hover:border-swift-600 hover:text-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-100 disabled:text-muted"
                disabled={!requestLink}
                onClick={() => void shareRequestLink()}
                type="button"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              {canGenerateLink ? (
                <Link
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                  href={dashboardHref}
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-lavender-300 px-4 text-sm font-bold text-white"
                  disabled
                  type="button"
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="surface-panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Preview</p>
            <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
              Request details
            </h2>
          </div>
          <QrCode className="h-5 w-5 text-swift-600" />
        </div>

        <div className="mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
          {requestLink ? (
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <LazyQRCodeSVG
                bgColor="#ffffff"
                fgColor="#160f24"
                marginSize={1}
                size={210}
                title="SwiftPay payment request"
                value={requestLink}
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-lavender-50 text-sm font-bold text-muted">
              QR preview
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-lavender-200 bg-white/80 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
          <div className="flex items-start justify-between gap-3">
            <span className="font-semibold text-muted">Wallet</span>
            <span className="min-w-0 break-all text-right font-mono text-xs font-bold text-ink">
              {trimmedWalletAddress || "Waiting for address"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-muted">Amount</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-ink">
              <TokenIcon
                className="h-4 w-4 shrink-0 rounded-full"
                symbol={initialToken}
              />
              <span>{trimmedAmount || "0.00"}</span>
              <span>{initialToken}</span>
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="font-semibold text-muted">Note</span>
            <span className="max-w-[13rem] text-right font-bold text-ink">
              {trimmedNote || "No note"}
            </span>
          </div>
        </div>

        <button
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-4 text-sm font-bold text-ink transition hover:-translate-y-0.5 hover:border-swift-600 hover:text-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-100 disabled:text-muted"
          disabled={!isWalletValid}
          onClick={() => void copyValue(trimmedWalletAddress, "address")}
          type="button"
        >
          {copied === "address" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied === "address" ? "Address copied" : "Copy wallet address"}
        </button>
      </aside>
    </section>
  );
}
