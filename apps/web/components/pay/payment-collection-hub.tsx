"use client";

import { StyledSelect } from "@/components/ui/styled-select";

import { motion } from "framer-motion";
import {
  ArrowRight,
  AtSign,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  Lock,
  MessageSquareText,
  QrCode,
  ReceiptText,
  Share2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { FadeUp } from "@/components/design/motion";
import { useT } from "@/components/locale-provider";
import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagedActivityBox } from "@/components/ui/paged-activity-box";
import {
  fetchPaymentRequestStatus,
} from "@/lib/payment-request-client";
import {
  buildPaymentRequestPath,
  buildPaymentRequestUrl,
  readPaymentRequestIdFromLink,
} from "@/lib/payment-request-url";
import { fetchProfile, formatUsernameLabel } from "@/lib/profile";
import { normalizeUsername, validateUsername } from "@/lib/profile-utils";
import {
  readRequestUsernameHistory,
  rememberRequestedUsername,
} from "@/lib/request-username-history";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { arcTestnet } from "@/lib/wagmi";

const requestsStorageKey = "swiftpay.payment.requests";

type RequestHistoryStatus = "active" | "expired" | "paid" | "declined";

type SavedRequest = {
  amount: string;
  createdAt: string;
  expiresInHours: number;
  id: string;
  link: string;
  note: string;
  requestId?: string;
  sentToUsername?: string;
  status: RequestHistoryStatus;
  token: ArcTokenSymbol;
  username?: string;
  wallet: string;
};

function isRequestExpired(request: SavedRequest) {
  const created = Date.parse(request.createdAt);
  if (!Number.isFinite(created)) {
    return request.status === "expired";
  }
  const hours = Number(request.expiresInHours);
  const ttlMs = (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
  return Date.now() >= created + ttlMs;
}

function deriveLocalRequestStatus(request: SavedRequest): RequestHistoryStatus {
  if (request.status === "paid" || request.status === "declined") {
    return request.status;
  }
  if (isRequestExpired(request)) {
    return "expired";
  }
  return "active";
}

function normalizeSavedRequest(request: SavedRequest): SavedRequest {
  const requestId =
    request.requestId ?? readPaymentRequestIdFromLink(request.link) ?? undefined;
  return {
    ...request,
    requestId,
    status: deriveLocalRequestStatus({ ...request, requestId }),
  };
}

type PaymentCollectionHubProps = {
  initialAmount: string;
  initialNote: string;
  initialToken: ArcTokenSymbol;
  initialUsername?: string;
  initialWalletAddress: string;
};

function isPositiveAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function shortenWallet(value: string) {
  if (!isAddress(value)) {
    return value;
  }

  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function requestHistoryKey(request: Pick<SavedRequest, "id" | "requestId">) {
  return request.requestId || request.id;
}

function requestContentKey(request: SavedRequest) {
  return [
    request.wallet.trim().toLowerCase(),
    request.token,
    request.amount.trim(),
    request.note.trim(),
    (request.sentToUsername ?? "").trim().toLowerCase(),
  ].join("|");
}

function requestRank(request: SavedRequest) {
  const created = Date.parse(request.createdAt);
  const statusScore =
    request.status === "paid"
      ? 3
      : request.status === "declined"
        ? 2
        : request.status === "active"
          ? 1
          : 0;
  const sentScore = request.sentToUsername ? 1 : 0;

  return (
    (Number.isFinite(created) ? created : 0) +
    statusScore * 1_000_000_000_000 +
    sentScore * 100_000_000_000
  );
}

function dedupeSavedRequests(requests: SavedRequest[]) {
  const byId = new Map<string, SavedRequest>();

  for (const request of requests) {
    const key = requestHistoryKey(request);
    if (!key) {
      continue;
    }

    const existing = byId.get(key);
    if (!existing || requestRank(request) >= requestRank(existing)) {
      byId.set(key, request);
    }
  }

  const byContent = new Map<string, SavedRequest>();

  for (const request of byId.values()) {
    const contentKey = request.sentToUsername
      ? `sent:${requestContentKey(request)}`
      : `draft:${request.wallet.trim().toLowerCase()}:${request.token}`;
    const existing = byContent.get(contentKey);
    if (!existing || requestRank(request) >= requestRank(existing)) {
      byContent.set(contentKey, request);
    }
  }

  return Array.from(byContent.values()).sort(
    (left, right) => requestRank(right) - requestRank(left),
  );
}

function readSavedRequests(): SavedRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(requestsStorageKey);
    const parsed = raw ? (JSON.parse(raw) as SavedRequest[]) : [];
    return dedupeSavedRequests(parsed.map(normalizeSavedRequest));
  } catch {
    return [];
  }
}

function writeSavedRequests(requests: SavedRequest[]) {
  window.localStorage.setItem(
    requestsStorageKey,
    JSON.stringify(dedupeSavedRequests(requests)),
  );
}

export function PaymentCollectionHub({
  initialAmount,
  initialNote,
  initialToken,
  initialUsername = "",
  initialWalletAddress,
}: PaymentCollectionHubProps) {
  const t = useT();
  const { address: connectedWallet, isConnected, source } = usePlatformWallet();
  const [origin, setOrigin] = useState("");
  const [requesterUsername, setRequesterUsername] = useState<string | null>(
    null,
  );
  const prefilledUsername = normalizeUsername(
    initialUsername ||
      (initialWalletAddress && !isAddress(initialWalletAddress)
        ? initialWalletAddress
        : ""),
  );
  const [shareUsername, setShareUsername] = useState(prefilledUsername);
  const [usernameHistory, setUsernameHistory] = useState<string[]>([]);
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);
  const [token, setToken] = useState<ArcTokenSymbol>(initialToken);
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [copied, setCopied] = useState<"address" | "link" | null>(null);
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [requestId, setRequestId] = useState("");

  const trimmedWalletAddress = connectedWallet ?? "";
  const trimmedAmount = amount.trim();
  const trimmedNote = note.trim();
  const isWalletValid = Boolean(
    trimmedWalletAddress && isAddress(trimmedWalletAddress),
  );
  const isAmountValid = isPositiveAmount(trimmedAmount);
  const normalizedShareUsername = normalizeUsername(shareUsername);
  const shareUsernameError = normalizedShareUsername
    ? validateUsername(normalizedShareUsername)
    : "Enter a SwiftPay username.";
  const canGenerateLink = Boolean(
    origin && isWalletValid && isAmountValid && isConnected,
  );

  const requestLink = useMemo(() => {
    if (!canGenerateLink) return "";

    return buildPaymentRequestUrl({
      amount: trimmedAmount,
      memo: trimmedNote,
      origin,
      path: "/dashboard",
      requestId,
      token,
      username: requesterUsername ?? undefined,
      walletAddress: requesterUsername ? undefined : trimmedWalletAddress,
    });
  }, [
    canGenerateLink,
    origin,
    requestId,
    requesterUsername,
    token,
    trimmedAmount,
    trimmedNote,
    trimmedWalletAddress,
  ]);

  const dashboardHref = useMemo(() => {
    return buildPaymentRequestPath({
      amount: isAmountValid ? trimmedAmount : undefined,
      memo: trimmedNote,
      path: "/dashboard",
      requestId: requestId || undefined,
      token,
      username: requesterUsername ?? undefined,
      walletAddress: requesterUsername
        ? undefined
        : isWalletValid
          ? trimmedWalletAddress
          : undefined,
    });
  }, [
    isAmountValid,
    isWalletValid,
    requesterUsername,
    token,
    trimmedAmount,
    trimmedNote,
    trimmedWalletAddress,
  ]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const cleaned = readSavedRequests();
    writeSavedRequests(cleaned);
    setSavedRequests(cleaned);
    setUsernameHistory(readRequestUsernameHistory());
    setRequestId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (savedRequests.length === 0) {
      return;
    }

    let cancelled = false;

    async function refreshRequestStatuses() {
      const next = await Promise.all(
        savedRequests.map(async (request) => {
          const local = normalizeSavedRequest(request);
          const id = local.requestId;
          if (!id || local.status === "paid" || local.status === "declined") {
            return local;
          }

          try {
            const remote = await fetchPaymentRequestStatus(id);
            if (
              remote.status === "paid" ||
              remote.status === "declined" ||
              remote.status === "expired"
            ) {
              return { ...local, status: remote.status };
            }
          } catch {
            // Keep the local expiry/active status if the status API is unavailable.
          }

          return local;
        }),
      );

      if (cancelled) {
        return;
      }

      const changed = next.some(
        (item, index) =>
          item.status !== savedRequests[index]?.status ||
          item.requestId !== savedRequests[index]?.requestId,
      );
      if (!changed) {
        return;
      }

      writeSavedRequests(next);
      setSavedRequests(next);
    }

    void refreshRequestStatuses();
    const intervalId = window.setInterval(() => {
      void refreshRequestStatuses();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [savedRequests]);

  useEffect(() => {
    if (!connectedWallet) {
      setRequesterUsername(null);
      return;
    }

    let cancelled = false;

    void fetchProfile(connectedWallet)
      .then((profile) => {
        if (!cancelled) {
          setRequesterUsername(profile?.username ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRequesterUsername(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedWallet]);

  function persistGeneratedRequest(sentToUsername?: string) {
    if (!requestLink || !canGenerateLink) return;

    const persistedId = requestId || crypto.randomUUID();
    const current = readSavedRequests();
    const existingIndex = current.findIndex(
      (item) => requestHistoryKey(item) === persistedId,
    );
    const existing = existingIndex >= 0 ? current[existingIndex] : undefined;

    const nextRequest: SavedRequest = normalizeSavedRequest({
      amount: trimmedAmount,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      expiresInHours: Number(expiresInHours) || 24,
      id: existing?.id ?? persistedId,
      link: requestLink,
      note: trimmedNote,
      requestId: persistedId,
      sentToUsername: sentToUsername ?? existing?.sentToUsername,
      status: existing?.status ?? "active",
      token,
      username: requesterUsername ?? undefined,
      wallet: trimmedWalletAddress,
    });

    const next =
      existingIndex >= 0
        ? current.map((item, index) =>
            index === existingIndex ? nextRequest : item,
          )
        : [nextRequest, ...current].slice(0, 12);

    writeSavedRequests(next);
    setSavedRequests(next);
  }

  async function copyValue(
    value: string,
    type: "address" | "link",
    options: { persist?: boolean } = {},
  ) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (type === "link" && options.persist) {
        persistGeneratedRequest();
      }
      setCopied(type);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }

  async function shareRequestLink() {
    if (!requestLink) return;
    try {
      persistGeneratedRequest();
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

  function applyHistoryUsername(username: string) {
    setShareUsername(normalizeUsername(username));
    setShareError(null);
    setShareStatus(null);
  }

  async function sendRequestNotification() {
    if (!isConnected || !trimmedWalletAddress) {
      setShareError("Connect a wallet to send a payment request.");
      setShareStatus(null);
      return;
    }

    if (!requestLink) {
      setShareError("Enter a valid amount to generate this request.");
      setShareStatus(null);
      return;
    }

    if (shareUsernameError) {
      setShareError(shareUsernameError);
      setShareStatus(null);
      return;
    }

    setIsSendingNotification(true);
    setShareError(null);
    setShareStatus(null);

    try {
      const response = await fetch("/api/payment-requests/notify", {
        body: JSON.stringify({
          amount: trimmedAmount,
          expiresInHours,
          fromLabel: requesterUsername
            ? formatUsernameLabel(requesterUsername)
            : shortenWallet(trimmedWalletAddress),
          fromUsername: requesterUsername ?? undefined,
          fromWallet: trimmedWalletAddress,
          note: trimmedNote,
          recipientUsername: normalizedShareUsername,
          requestId,
          requestLink,
          token,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        recipientUsername?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.message ?? "Payment request notification failed.",
        );
      }

      const savedUsername =
        payload?.recipientUsername ?? normalizedShareUsername;
      setUsernameHistory(rememberRequestedUsername(savedUsername));
      persistGeneratedRequest(savedUsername);
      setRequestId(crypto.randomUUID());
      setShareStatus(
        `Request sent to ${formatUsernameLabel(savedUsername)}.`,
      );
    } catch (error) {
      setShareError(
        error instanceof Error
          ? error.message
          : "Payment request notification failed.",
      );
    } finally {
      setIsSendingNotification(false);
    }
  }

  const activeCount = savedRequests.filter(
    (r) => deriveLocalRequestStatus(r) === "active",
  ).length;
  const recipientSummary = requesterUsername
    ? formatUsernameLabel(requesterUsername)
    : isWalletValid
      ? shortenWallet(trimmedWalletAddress)
      : "Connect a wallet";
  const walletSourceLabel =
    source === "embedded"
      ? "Embedded wallet"
      : source === "external"
        ? "External wallet"
        : "Not connected";

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
          Request payment to your connected wallet. Start with a SwiftPay
          username, then share the in-app request, link, or QR code.
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
          <p className="section-eyebrow">{t("pay.createRequest")}</p>
          <h2 className="section-title">{t("pay.askSomeone")}</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">{t("pay.sendRequestTo")}</span>
              <div className="field-shell flex h-11 items-center gap-2 px-3">
                <AtSign className="h-4 w-4 text-primary" />
                <Input
                  autoComplete="off"
                  className="border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                  onChange={(event) => {
                    setShareUsername(
                      event.target.value
                        .toLowerCase()
                        .replace(/^@+/, "")
                        .replace(/\s/g, ""),
                    );
                    setShareError(null);
                    setShareStatus(null);
                  }}
                  placeholder="username"
                  spellCheck={false}
                  value={shareUsername}
                />
              </div>
              {usernameHistory.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {usernameHistory.map((username) => (
                    <button
                      className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      key={username}
                      onClick={() => applyHistoryUsername(username)}
                      type="button"
                    >
                      {formatUsernameLabel(username)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Recent usernames you request from will appear here.
                </p>
              )}
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">Receiving wallet</span>
              <div className="field-shell flex h-11 items-center gap-2 px-3 opacity-90">
                {isConnected ? (
                  <Lock className="h-4 w-4 text-primary" />
                ) : (
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  className="border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                  readOnly
                  value={
                    isConnected
                      ? requesterUsername
                        ? `${formatUsernameLabel(requesterUsername)} · ${shortenWallet(trimmedWalletAddress)}`
                        : trimmedWalletAddress
                      : "Connect a wallet to lock this request"
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Locked to your {walletSourceLabel.toLowerCase()}. Funds always
                settle to this address.
              </p>
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
                <StyledSelect
                  ariaLabel="Select payment request expiration"
                  className="w-full"
                  onChange={setExpiresInHours}
                  options={[
                    { label: "1 hour", value: "1" },
                    { label: "24 hours", value: "24" },
                    { label: "3 days", value: "72" },
                    { label: "7 days", value: "168" },
                  ]}
                  value={expiresInHours}
                />
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

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold">Send in-app request</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The recipient can pay or decline. You will be notified if they
                  decline.
                </p>
              </div>
              <Button
                className="h-11 w-full sm:w-auto"
                disabled={
                  !requestLink ||
                  Boolean(shareUsernameError) ||
                  isSendingNotification ||
                  !isConnected
                }
                onClick={() => void sendRequestNotification()}
                type="button"
              >
                {isSendingNotification ? (
                  <Clock3 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                Send request
              </Button>
              {shareError ? (
                <p className="mt-2 text-sm text-destructive">{shareError}</p>
              ) : null}
              {shareStatus ? (
                <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                  {shareStatus}
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Generated link</span>
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {requestLink ||
                  "Connect a wallet and enter an amount to generate a link."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={!requestLink} onClick={() => void copyValue(requestLink, "link", { persist: true })} type="button">
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
              <p className="section-eyebrow">{t("pay.qrCode")}</p>
              <h2 className="section-title">{t("pay.scanToPay")}</h2>
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
                QR preview appears when the request is ready
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Pays to</span>
              <span className="max-w-[12rem] truncate text-right font-semibold">
                {recipientSummary}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Requesting</span>
              <span className="max-w-[12rem] truncate text-right font-semibold">
                {normalizedShareUsername
                  ? formatUsernameLabel(normalizedShareUsername)
                  : "Waiting"}
              </span>
            </div>
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

      <PagedActivityBox
        empty="Sent and generated requests appear here for quick tracking."
        items={savedRequests}
        title="Request history"
        renderItem={(request) => {
          const status = deriveLocalRequestStatus(request);
          return (
            <article className="collection-hub-request-card" key={request.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {request.amount} {request.token}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {request.sentToUsername
                      ? `Requested ${formatUsernameLabel(request.sentToUsername)}`
                      : request.username
                        ? `Pays ${formatUsernameLabel(request.username)}`
                        : `Pays ${shortenWallet(request.wallet)}`}
                  </p>
                  {request.note ? (
                    <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>
                  ) : null}
                </div>
                <Badge
                  variant={
                    status === "active"
                      ? "secondary"
                      : status === "paid"
                        ? "default"
                        : "outline"
                  }
                >
                  {status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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
                {request.sentToUsername ? (
                  <Button
                    onClick={() => applyHistoryUsername(request.sentToUsername ?? "")}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Use @{request.sentToUsername}
                  </Button>
                ) : null}
              </div>
            </article>
          );
        }}
      />
    </div>
  );
}
