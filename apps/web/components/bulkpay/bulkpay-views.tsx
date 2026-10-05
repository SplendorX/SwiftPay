"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  ReceiptText,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import "./bulkpay.css";

import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import { formatBatchReceiptTime } from "@/lib/batch-receipt";
import { arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";
import { bottomSheetClassName, useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function shortAddress(value?: string | null) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Header: back to the dashboard, the title, and a balance refresh. */
export function BulkpayBar({ onRefresh, refreshing }: { onRefresh: () => void; refreshing?: boolean }) {
  return (
    <header className="bulkpay-bar">
      <Link aria-label="Back to the dashboard" className="bulkpay-round" href="/dashboard">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <h1 className="bulkpay-title">BulkPay</h1>
      <button
        aria-label="Refresh balances"
        className="bulkpay-round"
        disabled={refreshing}
        onClick={onRefresh}
        title="Refresh balances"
        type="button"
      >
        <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
      </button>
    </header>
  );
}

/** The SwiftPay-gradient card: what this batch will take, from which wallet, in which token. */
export function BulkpayHero({
  available,
  body,
  feePercent,
  maxRecipients,
  onTokenChange,
  people,
  token,
  total,
  walletAddress,
  walletLabel,
}: {
  available: string;
  body: string;
  feePercent: number;
  maxRecipients: number;
  onTokenChange: (token: ArcTokenSymbol) => void;
  people: number;
  token: ArcTokenSymbol;
  total: string;
  walletAddress?: string;
  walletLabel: string;
}) {
  return (
    <section className="bulkpay-hero">
      <span aria-hidden className="bulkpay-hero-glow" />
      <div className="bulkpay-hero-top">
        <span className="bulkpay-hero-wallet">
          <Wallet className="h-3.5 w-3.5" />
          {walletLabel} · {shortAddress(walletAddress)}
        </span>
        <div aria-label="Token" className="bulkpay-tokens" role="radiogroup">
          {arcTokenSymbols.map((symbol) => (
            <button
              aria-checked={symbol === token}
              className="bulkpay-token"
              key={symbol}
              onClick={() => onTokenChange(symbol)}
              role="radio"
              type="button"
            >
              <TokenIcon className="h-4 w-4" symbol={symbol} />
              {symbol}
            </button>
          ))}
        </div>
      </div>

      <p className="bulkpay-hero-label">Total to send</p>
      <p className="bulkpay-hero-amount">{total}</p>
      <p className="bulkpay-hero-sub">
        {people > 0
          ? `${people.toLocaleString()} ${people === 1 ? "person" : "people"} · includes the ${feePercent}% fee`
          : body}
      </p>

      <div className="bulkpay-hero-foot">
        <span>
          Available <strong>{available}</strong>
        </span>
        <span className="bulkpay-hero-pill">
          <Users className="h-3.5 w-3.5" />
          Up to {maxRecipients.toLocaleString()}
        </span>
      </div>
    </section>
  );
}

/** The composer's frame, with its import and clear actions. */
export function BulkpayPeopleCard({ children, errors }: { children: ReactNode; errors: string[] }) {
  return (
    <section className="bulkpay-card bulkpay-people">
      {children}
      {errors.length > 0 ? (
        <div className="bulkpay-alert is-error mt-4" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            {errors.slice(0, 4).map((rowError) => (
              <p className="break-words" key={rowError}>
                {rowError}
              </p>
            ))}
            {errors.length > 4 ? <p>{errors.length - 4} more issue(s)</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export type BulkpayBreakdown = {
  available: string;
  fee: string;
  feePercent: number;
  payout: string;
  people: number;
  total: string;
};

function BreakdownRows({ breakdown }: { breakdown: BulkpayBreakdown }) {
  return (
    <dl className="bulkpay-rows">
      <div>
        <dt>People</dt>
        <dd>{breakdown.people.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Payout total</dt>
        <dd>{breakdown.payout}</dd>
      </div>
      <div>
        <dt>Service fee ({breakdown.feePercent}%)</dt>
        <dd>{breakdown.fee}</dd>
      </div>
      <div className="is-total">
        <dt>Total</dt>
        <dd>{breakdown.total}</dd>
      </div>
      <div>
        <dt>Available</dt>
        <dd>{breakdown.available}</dd>
      </div>
    </dl>
  );
}

function StatusLine({ error, pending, status }: { error: string | null; pending: boolean; status: string }) {
  return (
    <p className={cn("bulkpay-status", error && "is-error")} role="status">
      {error ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : pending ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <span className="min-w-0 break-words">{error ?? status}</span>
    </p>
  );
}

/** The live summary beside (or below) the people, leading to the review sheet. */
export function BulkpaySummary({
  breakdown,
  canReview,
  contractMissing,
  error,
  explorerUrl,
  insufficient,
  onCopy,
  onReview,
  pending,
  resolving,
  status,
}: {
  breakdown: BulkpayBreakdown;
  canReview: boolean;
  contractMissing: boolean;
  error: string | null;
  explorerUrl: string;
  insufficient: boolean;
  onCopy: () => void;
  onReview: () => void;
  pending: boolean;
  resolving: boolean;
  status: string;
}) {
  const label = pending
    ? "Processing"
    : resolving
      ? "Checking people…"
      : breakdown.people === 0
        ? "Add people to continue"
        : `Review ${breakdown.people.toLocaleString()} ${breakdown.people === 1 ? "payment" : "payments"}`;

  return (
    <section className="bulkpay-card bulkpay-summary">
      <div className="bulkpay-card-head">
        <h2>Summary</h2>
        <button aria-label="Copy summary" className="bulkpay-icon-button" onClick={onCopy} title="Copy summary" type="button">
          <Copy className="h-4 w-4" />
        </button>
      </div>

      <BreakdownRows breakdown={breakdown} />

      {contractMissing ? (
        <p className="bulkpay-alert is-warn">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Set NEXT_PUBLIC_SWIFTBATCH_ADDRESS after deploying the contract.
        </p>
      ) : null}
      {insufficient ? (
        <p className="bulkpay-alert is-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Your balance must cover the payouts plus the service fee.
        </p>
      ) : null}

      <Button className="bulkpay-cta" disabled={!canReview} onClick={onReview} type="button">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {label}
      </Button>

      {error || status !== "Ready" ? <StatusLine error={error} pending={pending} status={status} /> : null}

      {explorerUrl ? (
        <a className="bulkpay-link" href={explorerUrl} rel="noreferrer" target="_blank">
          <ExternalLink className="h-4 w-4" />
          View on ArcScan
        </a>
      ) : null}
    </section>
  );
}

export type BulkpayReviewPerson = {
  address: string;
  amount: string;
  line: number;
  name: string;
  note?: string;
};

/** Everyone in the batch and what it costs, confirmed in one place before sending. */
export function BulkpayReviewSheet({
  breakdown,
  canSend,
  error,
  onClose,
  onSend,
  open,
  pending,
  people,
  status,
  token,
}: {
  breakdown: BulkpayBreakdown;
  canSend: boolean;
  error: string | null;
  onClose: () => void;
  onSend: () => void;
  open: boolean;
  pending: boolean;
  people: BulkpayReviewPerson[];
  status: string;
  token: ArcTokenSymbol;
}) {
  const side = useSheetSide();
  return (
    <Sheet onOpenChange={(next) => !next && !pending && onClose()} open={open}>
      <SheetContent
        className={cn("gap-0 p-0", side === "bottom" ? bottomSheetClassName : "w-full sm:max-w-md")}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="bulkpay-sheet">
          <header className="bulkpay-sheet-head">
            <SheetTitle className="text-lg font-bold">Review BulkPay</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              One transaction pays everyone below.
            </SheetDescription>
          </header>

          <div className="bulkpay-sheet-total">
            <TokenIcon className="h-9 w-9" symbol={token} />
            <div className="min-w-0">
              <p className="bulkpay-sheet-amount">{breakdown.total}</p>
              <p className="text-sm text-muted-foreground">
                to {breakdown.people.toLocaleString()} {breakdown.people === 1 ? "person" : "people"}
              </p>
            </div>
          </div>

          <ol className="bulkpay-review-list">
            {people.slice(0, 500).map((person) => (
              <li key={`${person.line}-${person.address}`}>
                <span className="bulkpay-review-avatar">
                  <UserRound className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{person.name}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {person.note ? `${person.note} · ` : ""}
                    {shortAddress(person.address)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {person.amount} {token}
                </span>
              </li>
            ))}
          </ol>

          <BreakdownRows breakdown={breakdown} />

          {error || pending ? <StatusLine error={error} pending={pending} status={status} /> : null}

          <div className="bulkpay-sheet-actions">
            <Button className="h-12 w-full rounded-xl text-base font-bold" disabled={!canSend} onClick={onSend} type="button">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {pending ? "Processing" : `Send ${breakdown.total}`}
            </Button>
            <Button className="h-11 w-full rounded-xl" disabled={pending} onClick={onClose} type="button" variant="ghost">
              Back to editing
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export type BulkpayReceiptView = {
  contractAddress: string;
  explorerUrl: string | null;
  feeAmount: string;
  id: string;
  mode: string;
  payoutTotal: string;
  recipientCount: number;
  recipients: Array<{ address: string; amount: string; label?: string; line: number }>;
  submittedAt: string;
  token: ArcTokenSymbol;
  txHash: string | null;
};

/** The most recent batch from this visit, with its share and download actions. */
export function BulkpayLastReceipt({
  onDownload,
  onShare,
  receipt,
}: {
  onDownload: () => void;
  onShare: () => void;
  receipt: BulkpayReceiptView | null;
}) {
  return (
    <section className="bulkpay-card">
      <div className="bulkpay-card-head">
        <h2>Last batch</h2>
        <span className="bulkpay-head-icon">
          <ReceiptText className="h-4 w-4" />
        </span>
      </div>

      {receipt ? (
        <>
          <div className="bulkpay-receipt">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="bulkpay-receipt-label">Sent</p>
                <p className="bulkpay-receipt-amount">{receipt.payoutTotal}</p>
                <p className="text-sm text-muted-foreground">
                  {receipt.recipientCount.toLocaleString()} {receipt.recipientCount === 1 ? "person" : "people"} ·{" "}
                  {receipt.mode}
                </p>
              </div>
              <TokenIcon className="h-9 w-9 rounded-full" symbol={receipt.token} />
            </div>
            <div className="bulkpay-receipt-grid">
              <div>
                <p>Fee</p>
                <strong>{receipt.feeAmount}</strong>
              </div>
              <div>
                <p>Submitted</p>
                <strong>{formatBatchReceiptTime(receipt.submittedAt)}</strong>
              </div>
            </div>
            <div className="bulkpay-receipt-meta">
              <span>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Contract {shortAddress(receipt.contractAddress)}
              </span>
              <span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {receipt.txHash ? `Hash ${shortAddress(receipt.txHash)}` : "Hash pending from wallet provider"}
              </span>
            </div>
          </div>

          <ul className="bulkpay-receipt-people">
            {receipt.recipients.slice(0, 4).map((recipient) => (
              <li key={`${receipt.id}-${recipient.line}-${recipient.address}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{recipient.label || `Person ${recipient.line}`}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{recipient.address}</span>
                </span>
                <span className="shrink-0 text-sm font-bold">
                  {recipient.amount} {receipt.token}
                </span>
              </li>
            ))}
          </ul>
          {receipt.recipients.length > 4 ? (
            <p className="bulkpay-more">+{receipt.recipients.length - 4} more on this receipt</p>
          ) : null}

          <div className="bulkpay-receipt-actions">
            <Button className="h-11 w-full sm:w-auto sm:flex-1" onClick={onShare} type="button" variant="outline">
              <Share2 className="h-4 w-4" />
              Share
            </Button>
            <Button className="h-11 w-full sm:w-auto sm:flex-1" onClick={onDownload} type="button" variant="outline">
              <Download className="h-4 w-4" />
              Download PNG
            </Button>
          </div>
          {receipt.explorerUrl ? (
            <a className="bulkpay-link" href={receipt.explorerUrl} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" />
              Open ArcScan receipt
            </a>
          ) : null}
        </>
      ) : (
        <p className="bulkpay-empty">
          After you send, your receipt shows here with the totals, fee and who was paid.
        </p>
      )}
    </section>
  );
}

/** Quiet facts: which wallet signs, the contract, the limit. */
export function BulkpayFacts({
  contract,
  contractLabel,
  maxRecipients,
  walletAddress,
  walletLabel,
}: {
  contract: string;
  contractLabel: string;
  maxRecipients: number;
  walletAddress?: string;
  walletLabel: string;
}) {
  return (
    <section className="bulkpay-card">
      <dl className="bulkpay-rows">
        <div>
          <dt>Paying from</dt>
          <dd>
            {walletLabel} · <span className="font-mono">{shortAddress(walletAddress)}</span>
          </dd>
        </div>
        <div>
          <dt>{contractLabel}</dt>
          <dd className="font-mono">{contract}</dd>
        </div>
        <div>
          <dt>Limit</dt>
          <dd>{maxRecipients.toLocaleString()} people per batch</dd>
        </div>
      </dl>
      <p className="bulkpay-facts-note">
        Batches are signed by your signed-in profile&apos;s wallet only.
      </p>
    </section>
  );
}
