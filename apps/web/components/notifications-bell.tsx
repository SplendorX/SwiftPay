"use client";

import {
  ArrowDownLeft,
  Ban,
  Bell,
  CheckCheck,
  Copy,
  ExternalLink,
  Loader2,
  LockKeyhole,
  PiggyBank,
  ReceiptText,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
} from "@/lib/circle-session";
import { withPaymentRequestId } from "@/lib/payment-request-url";
import {
  alertPreferencesChangedEvent,
  readAlertPreferences,
  shouldShowAlertToast,
  type AlertCategory,
} from "@/lib/notifications/preferences";
import { deleteSavingsNotifications } from "@/lib/save/client";
import {
  extractClaimCodeFromNotification,
  extractPaymentRequestId,
  getAlertInboxCategory,
  isPaymentRequestDeclinedNotification,
  isPaymentRequestMarkedDeclined,
  isPaymentRequestMarkedPaid,
  isPaymentRequestNotification,
  isPrivSwiftPayClaimNotification,
  type SavingsNotificationRecord,
} from "@/lib/save/notifications";
import {
  fetchWalletSessionForAddress,
  walletSessionChangedEventName,
} from "@/lib/wallet-auth-client";
import { arcTestnet } from "@/lib/wagmi";
import { cn } from "@/lib/utils";

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function explorerTxUrl(hash: string) {
  const base =
    process.env.NEXT_PUBLIC_ARC_EXPLORER_URL?.trim() ||
    arcTestnet.blockExplorers.default.url;
  return `${base.replace(/\/$/, "")}/tx/${hash}`;
}

function getMeta(item: SavingsNotificationRecord) {
  if (!item.metadata || typeof item.metadata !== "object") {
    return null;
  }
  return item.metadata as Record<string, unknown>;
}

function getClaimCodeFromNotification(item: SavingsNotificationRecord) {
  return extractClaimCodeFromNotification(item);
}

function isClaimNotification(item: SavingsNotificationRecord) {
  return isPrivSwiftPayClaimNotification(item);
}

function getDepositTxHash(item: SavingsNotificationRecord) {
  const meta = getMeta(item);
  const hash = meta?.depositTxHash;
  if (typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/i.test(hash)) {
    return hash;
  }
  const bodyTx = item.body?.match(/Deposit tx:\s*(0x[a-fA-F0-9]{64})/i);
  if (bodyTx?.[1]) {
    return bodyTx[1];
  }
  if (
    !isClaimNotification(item) &&
    item.related_tx_hash &&
    /^0x[a-fA-F0-9]{64}$/i.test(item.related_tx_hash)
  ) {
    return item.related_tx_hash;
  }
  return null;
}

function claimSummaryFromBody(item: SavingsNotificationRecord) {
  const meta = getMeta(item);
  if (typeof meta?.amount === "string" && typeof meta?.token === "string") {
    return `${meta.amount} ${meta.token} ready to claim`;
  }
  const match = item.body?.match(/You received \$([0-9.]+)\s+([A-Z]+)/i);
  if (match) {
    return `${match[1]} ${match[2]} ready to claim`;
  }
  return null;
}

function displayTitle(item: SavingsNotificationRecord) {
  if (isClaimNotification(item)) {
    return claimSummaryFromBody(item) ?? item.title;
  }
  return item.title;
}

function displayBody(item: SavingsNotificationRecord) {
  return (item.body ?? "")
    .replace(/CLAIM_CODE:\S+/gi, "")
    .replace(/PAYMENT_ID:\S+/gi, "")
    .replace(/Deposit tx:\s*0x[a-fA-F0-9]{64}/gi, "")
    .replace(/PAYMENT_REQUEST_ID:\S+/gi, "")
    .replace(/PAYMENT_REQUEST_LINK:\S+/gi, "")
    .replace(/FROM_WALLET:\S+/gi, "")
    .replace(/FROM_USERNAME:\S+/gi, "")
    .replace(/DECLINED_REQUEST_ID:\S+/gi, "")
    .replace(/DECLINED_BY_USERNAME:\S+/gi, "")
    .replace(/DECLINED_BY:\S+/gi, "")
    .replace(/\bDECLINED:1\b/gi, "")
    .replace(/\bPAID:1\b/gi, "")
    .replace(/Open PrivSwiftPay[^\n.]*/gi, "")
    .replace(/Copy claim code below\.?/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/ready to claim/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function claimPageHref(claimCode: string) {
  return `/privSwiftPay/claim?code=${encodeURIComponent(claimCode)}`;
}

function paymentRequestHref(item: SavingsNotificationRecord) {
  const meta = getMeta(item);
  const link = meta?.requestLink;
  const rawLink =
    typeof link === "string" && link.trim()
      ? link.trim()
      : item.body?.match(/PAYMENT_REQUEST_LINK:(\S+)/i)?.[1];

  if (!rawLink) {
    return null;
  }

  let href: string | null = null;

  try {
    const url = new URL(rawLink);
    href = `${url.pathname}${url.search}`;
  } catch {
    href = rawLink.startsWith("/dashboard?") ? rawLink : null;
  }

  if (!href) {
    return null;
  }

  const requestId = extractPaymentRequestId(item);
  return requestId ? withPaymentRequestId(href, requestId) : href;
}

export function NotificationsBell({ className }: { className?: string }) {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleWalletAddress, setCircleWalletAddress] = useState("");
  const [walletAuthorized, setWalletAuthorized] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [items, setItems] = useState<SavingsNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alertPrefs, setAlertPrefs] = useState(() =>
    typeof window === "undefined"
      ? {
          toasts: true,
          quietHoursEnabled: false,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
          categories: {
            payments: true,
            requests: true,
            savings: true,
            claims: true,
          },
        }
      : readAlertPreferences(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnce = useRef(false);

  const refreshCircleState = useCallback(() => {
    const login = readCircleLogin();
    setCircleLogin(login);
    const wallets = readCircleWallets();
    setCircleWalletAddress(wallets[0]?.address ?? "");
  }, []);

  useEffect(() => {
    refreshCircleState();
    window.addEventListener(circleSessionEventName, refreshCircleState);
    return () => {
      window.removeEventListener(circleSessionEventName, refreshCircleState);
    };
  }, [refreshCircleState]);

  useEffect(() => {
    function refreshPrefs() {
      setAlertPrefs(readAlertPreferences());
    }
    refreshPrefs();
    window.addEventListener(alertPreferencesChangedEvent, refreshPrefs);
    window.addEventListener("storage", refreshPrefs);
    return () => {
      window.removeEventListener(alertPreferencesChangedEvent, refreshPrefs);
      window.removeEventListener("storage", refreshPrefs);
    };
  }, []);

  const ownerWallet = useMemo(() => {
    if (circleLogin && circleWalletAddress) {
      return circleWalletAddress;
    }
    if (isConnected && wagmiAddress) {
      return wagmiAddress;
    }
    return undefined;
  }, [circleLogin, circleWalletAddress, isConnected, wagmiAddress]);

  const circleSocialUuid = useMemo(
    () => getCircleLoginIdentity(circleLogin)?.socialUserUUID ?? undefined,
    [circleLogin],
  );

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      if (!ownerWallet) {
        if (!cancelled) {
          setWalletAuthorized(false);
          setAuthHint(null);
        }
        return;
      }

      if (circleLogin && circleSocialUuid) {
        if (!cancelled) {
          setWalletAuthorized(true);
          setAuthHint(null);
        }
        return;
      }

      try {
        const session = await fetchWalletSessionForAddress(ownerWallet);
        if (cancelled) return;
        setWalletAuthorized(Boolean(session.authenticated));
        setAuthHint(
          session.authenticated
            ? null
            : "Authorize your wallet (sign message) to load notifications.",
        );
      } catch {
        if (!cancelled) {
          setWalletAuthorized(false);
          setAuthHint("Authorize your wallet to load notifications.");
        }
      }
    }

    void checkAuth();

    function onSessionChange() {
      void checkAuth();
    }
    window.addEventListener(walletSessionChangedEventName, onSessionChange);
    return () => {
      cancelled = true;
      window.removeEventListener(walletSessionChangedEventName, onSessionChange);
    };
  }, [circleLogin, circleSocialUuid, ownerWallet]);

  const load = useCallback(async () => {
    if (!ownerWallet) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        ownerWallet,
        syncIncoming: "1",
      });
      if (circleSocialUuid) {
        params.set("circleSocialUuid", circleSocialUuid);
      }

      const res = await fetch(`/api/savings/notifications?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json()) as {
        notifications?: SavingsNotificationRecord[];
        unreadCount?: number;
        incomingSync?: { created?: number };
        message?: string;
      };

      if (!res.ok) {
        setItems([]);
        setUnreadCount(0);
        if (res.status === 401) {
          setAuthHint(
            json.message ?? "Authorize this wallet to load notifications.",
          );
          setWalletAuthorized(false);
        }
        return;
      }

      setAuthHint(null);
      setWalletAuthorized(true);

      const next = json.notifications ?? [];
      const nextUnread = json.unreadCount ?? 0;

      if (hasLoadedOnce.current) {
        for (const item of next) {
          const isClaim = isClaimNotification(item);
          const isRequest = isPaymentRequestNotification(item);
          const isDeclined = isPaymentRequestDeclinedNotification(item);
          const isReceive =
            item.kind === "payment_received" &&
            !isClaim &&
            !isRequest &&
            !isDeclined;

          if (
            (isReceive || isClaim || isRequest || isDeclined) &&
            !item.read_at &&
            !knownIdsRef.current.has(item.id)
          ) {
            const category = getAlertInboxCategory(item) as AlertCategory;
            if (!shouldShowAlertToast(alertPrefs, category)) {
              continue;
            }
            const claimCode = getClaimCodeFromNotification(item);
            const requestHref = isRequest ? paymentRequestHref(item) : null;
            toast.success(displayTitle(item), {
              description: displayBody(item),
              action: claimCode
                ? {
                    label: "Claim",
                    onClick: () => {
                      window.location.href = claimPageHref(claimCode);
                    },
                  }
                : requestHref
                  ? {
                      label: "Open",
                      onClick: () => {
                        window.location.href = requestHref;
                      },
                    }
                  : undefined,
            });
          }
        }
      }

      knownIdsRef.current = new Set(next.map((item) => item.id));
      hasLoadedOnce.current = true;
      setItems(next);
      setUnreadCount(nextUnread);
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [alertPrefs, circleSocialUuid, ownerWallet]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function deleteOne(id: string) {
    if (!ownerWallet) return;
    setDeletingId(id);
    try {
      const result = await deleteSavingsNotifications({
        ownerWallet,
        circleSocialUuid,
        ids: [id],
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (typeof result.unreadCount === "number") {
        setUnreadCount(result.unreadCount);
      } else {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    } catch {
      toast.error("Could not delete this alert");
    } finally {
      setDeletingId(null);
    }
  }

  async function clearInbox() {
    if (!ownerWallet || items.length === 0) return;
    setClearing(true);
    try {
      await deleteSavingsNotifications({
        ownerWallet,
        circleSocialUuid,
        all: true,
        keepImportant: true,
      });
      await load();
      toast.success("Cleared alerts", {
        description: "Open claims and payment requests were kept.",
      });
    } catch {
      toast.error("Could not clear alerts");
    } finally {
      setClearing(false);
    }
  }

  async function markAllRead() {
    if (!ownerWallet || unreadCount === 0) return;
    setMarking(true);
    try {
      await fetch("/api/savings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ownerWallet,
          circleSocialUuid,
        }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.read_at
            ? item
            : { ...item, read_at: new Date().toISOString() },
        ),
      );
      setUnreadCount(0);
    } catch {
      // keep existing unread state
    } finally {
      setMarking(false);
    }
  }

  async function copyClaimCode(item: SavingsNotificationRecord) {
    const code = getClaimCodeFromNotification(item);
    if (!code || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(item.id);
      toast.success("Claim code copied");
      window.setTimeout(() => {
        setCopiedId((current) => (current === item.id ? null : current));
      }, 1600);
    } catch {
      toast.error("Could not copy claim code");
    }
  }

  async function declineRequest(item: SavingsNotificationRecord) {
    if (!ownerWallet) return;

    setDecliningId(item.id);
    try {
      const response = await fetch("/api/payment-requests/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          circleSocialUuid,
          notificationId: item.id,
          ownerWallet,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        notification?: SavingsNotificationRecord;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not decline this request.");
      }

      const declinedAt = new Date().toISOString();
      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? {
                ...current,
                ...(payload?.notification ?? {}),
                metadata: {
                  ...((current.metadata && typeof current.metadata === "object"
                    ? current.metadata
                    : {}) as Record<string, unknown>),
                  status: "declined",
                  declinedAt,
                },
                read_at: current.read_at ?? declinedAt,
                body: current.body.includes("DECLINED:1")
                  ? current.body
                  : `${current.body}\nDECLINED:1`,
              }
            : current,
        ),
      );
      toast.success("Request declined", {
        description: "The sender will be notified.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not decline this request.",
      );
    } finally {
      setDecliningId(null);
    }
  }

  function toggle() {
    setOpen((value) => {
      const next = !value;
      if (next) void load();
      return next;
    });
  }

  const badge =
    unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null;
  const hasIdentity = Boolean(ownerWallet);

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          badge ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-background/70 text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-background hover:text-foreground"
        onClick={toggle}
        type="button"
      >
        <Bell className="h-4 w-4" />
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          aria-label="Notifications"
          className="notifications-popover"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-[11px] text-muted-foreground">
                Payments, claim codes, and savings
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 ? (
                <Button
                  disabled={marking}
                  onClick={() => void markAllRead()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {marking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5">Mark read</span>
                </Button>
              ) : null}
              {items.length > 0 ? (
                <Button
                  disabled={clearing}
                  onClick={() => void clearInbox()}
                  size="sm"
                  title="Clear inbox, keep claims and requests"
                  type="button"
                  variant="ghost"
                >
                  {clearing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="notifications-popover-list">
            {!hasIdentity ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Connect a wallet or sign in with Google to see notifications.
              </div>
            ) : authHint && !walletAuthorized && items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium">Authorize wallet</p>
                <p className="mt-1 text-xs text-muted-foreground">{authHint}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  After connecting, approve the sign-in message in your wallet.
                </p>
              </div>
            ) : loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-medium">You’re all caught up</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Incoming payments, claim codes, and savings updates show up
                  here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {items.map((item) => {
                  const unread = !item.read_at;
                  const isDeclinedNotice =
                    isPaymentRequestDeclinedNotification(item);
                  const isReceive =
                    item.kind === "payment_received" &&
                    !isClaimNotification(item) &&
                    !isPaymentRequestNotification(item) &&
                    !isDeclinedNotice;
                  const isClaim = isClaimNotification(item);
                  const isRequest = isPaymentRequestNotification(item);
                  const requestDeclined =
                    isRequest && isPaymentRequestMarkedDeclined(item);
                  const requestPaid =
                    isRequest && isPaymentRequestMarkedPaid(item);
                  const requestClosed = requestDeclined || requestPaid;
                  const claimCode = isClaim
                    ? getClaimCodeFromNotification(item)
                    : null;
                  const requestHref = isRequest ? paymentRequestHref(item) : null;
                  const txHash = getDepositTxHash(item);

                  return (
                    <li key={item.id}>
                      <div
                        className={cn(
                          "px-3 py-3 transition",
                          unread ? "bg-primary/5" : "bg-transparent",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                              isReceive
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : isRequest
                                  ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                                  : isDeclinedNotice
                                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                    : isClaim
                                      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                      : "bg-muted text-muted-foreground",
                            )}
                          >
                            {isReceive ? (
                              <ArrowDownLeft className="h-3.5 w-3.5" />
                            ) : isRequest || isDeclinedNotice ? (
                              <ReceiptText className="h-3.5 w-3.5" />
                            ) : isClaim ? (
                              <LockKeyhole className="h-3.5 w-3.5" />
                            ) : (
                              <PiggyBank className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug">
                                {displayTitle(item)}
                                {unread ? (
                                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                                ) : null}
                              </p>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {relativeTime(item.created_at)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {displayBody(item)}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                              {item.pocket_id ? (
                                <Link
                                  className="text-[11px] font-medium text-primary hover:underline"
                                  href={`/save/${item.pocket_id}`}
                                  onClick={() => setOpen(false)}
                                >
                                  View pocket
                                </Link>
                              ) : null}
                              {isReceive ? (
                                <Link
                                  className="text-[11px] font-medium text-primary hover:underline"
                                  href="/dashboard"
                                  onClick={() => setOpen(false)}
                                >
                                  Open dashboard
                                </Link>
                              ) : null}
                              {isRequest && requestHref && !requestClosed ? (
                                <Link
                                  className="text-[11px] font-medium text-primary hover:underline"
                                  href={requestHref}
                                  onClick={() => setOpen(false)}
                                >
                                  Open request
                                </Link>
                              ) : null}
                              {isRequest && !requestClosed ? (
                                <button
                                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400"
                                  disabled={decliningId === item.id}
                                  onClick={() => void declineRequest(item)}
                                  type="button"
                                >
                                  {decliningId === item.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Ban className="h-3 w-3" />
                                  )}
                                  {decliningId === item.id
                                    ? "Declining"
                                    : "Decline"}
                                </button>
                              ) : null}
                              {isRequest && requestDeclined ? (
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  Declined
                                </span>
                              ) : null}
                              {isRequest && requestPaid ? (
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  Paid
                                </span>
                              ) : null}
                              {isClaim && claimCode ? (
                                <>
                                  <button
                                    aria-label={
                                      copiedId === item.id
                                        ? "Claim code copied"
                                        : "Copy claim code"
                                    }
                                    className="inline-flex h-5 w-5 items-center justify-center text-primary hover:text-foreground"
                                    onClick={() => void copyClaimCode(item)}
                                    title={
                                      copiedId === item.id
                                        ? "Copied"
                                        : "Copy claim code"
                                    }
                                    type="button"
                                  >
                                    {copiedId === item.id ? (
                                      <CheckCheck className="h-3.5 w-3.5" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <Link
                                    className="text-[11px] font-medium text-primary hover:underline"
                                    href={claimPageHref(claimCode)}
                                    onClick={() => setOpen(false)}
                                  >
                                    Open claim page
                                  </Link>
                                </>
                              ) : null}
                              {txHash ? (
                                <a
                                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                                  href={explorerTxUrl(txHash)}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  View tx
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : null}
                              <button
                                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400"
                                disabled={deletingId === item.id}
                                onClick={() => void deleteOne(item.id)}
                                type="button"
                              >
                                {deletingId === item.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border/80 px-3 py-2">
            <Link
              className="block rounded-lg px-2 py-1.5 text-center text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              href="/settings#alerts"
              onClick={() => setOpen(false)}
            >
              Manage alerts
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
