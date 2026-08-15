"use client";

import {
  ArrowDownLeft,
  Bell,
  CheckCheck,
  Clock3,
  Filter,
  Inbox,
  Loader2,
  LockKeyhole,
  PiggyBank,
  ReceiptText,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
} from "@/lib/circle-session";
import {
  alertPreferencesChangedEvent,
  isWithinQuietHours,
  readAlertPreferences,
  writeAlertPreferences,
  type AlertCategory,
  type AlertPreferences,
} from "@/lib/notifications/preferences";
import { deleteSavingsNotifications } from "@/lib/save/client";
import {
  extractClaimCodeFromNotification,
  extractPaymentRequestId,
  getAlertInboxCategory,
  isPaymentRequestDeclinedNotification,
  isPaymentRequestNotification,
  isPrivSwiftPayClaimNotification,
  type SavingsNotificationRecord,
} from "@/lib/save/notifications";
import {
  fetchWalletSessionForAddress,
  walletSessionChangedEventName,
} from "@/lib/wallet-auth-client";
import { cn } from "@/lib/utils";

const categoryMeta: Record<
  AlertCategory | "all",
  { label: string; hint: string }
> = {
  all: { label: "All", hint: "Everything in the inbox" },
  payments: { label: "Money in", hint: "Incoming transfers" },
  requests: { label: "Requests", hint: "Pay requests and declines" },
  savings: { label: "Savings", hint: "Pockets, Spend&Save, locks" },
  claims: { label: "Claims", hint: "Private claim codes" },
};

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

function cleanBody(item: SavingsNotificationRecord) {
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
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function isImportant(item: SavingsNotificationRecord) {
  if (isPrivSwiftPayClaimNotification(item)) return true;
  return (
    isPaymentRequestNotification(item) &&
    !isPaymentRequestDeclinedNotification(item)
  );
}

function groupLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startItem = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (startToday.getTime() - startItem.getTime()) / 86_400_000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  return "Earlier";
}

export function AlertsSettings() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleWalletAddress, setCircleWalletAddress] = useState("");
  const [walletAuthorized, setWalletAuthorized] = useState(false);
  const [prefs, setPrefs] = useState<AlertPreferences>(defaultPrefsSafe);
  const [items, setItems] = useState<SavingsNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AlertCategory | "all">("all");
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refreshCircle = useCallback(() => {
    const login = readCircleLogin();
    setCircleLogin(login);
    setCircleWalletAddress(readCircleWallets()[0]?.address ?? "");
  }, []);

  useEffect(() => {
    refreshCircle();
    window.addEventListener(circleSessionEventName, refreshCircle);
    return () => window.removeEventListener(circleSessionEventName, refreshCircle);
  }, [refreshCircle]);

  useEffect(() => {
    setPrefs(readAlertPreferences());
    function onChange() {
      setPrefs(readAlertPreferences());
    }
    window.addEventListener(alertPreferencesChangedEvent, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(alertPreferencesChangedEvent, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const ownerWallet = useMemo(() => {
    if (circleLogin && circleWalletAddress) return circleWalletAddress;
    if (isConnected && wagmiAddress) return wagmiAddress;
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
            : "Authorize this wallet to manage alerts.",
        );
      } catch {
        if (!cancelled) {
          setWalletAuthorized(false);
          setAuthHint("Authorize this wallet to manage alerts.");
        }
      }
    }
    void checkAuth();
    window.addEventListener(walletSessionChangedEventName, checkAuth);
    return () => {
      cancelled = true;
      window.removeEventListener(walletSessionChangedEventName, checkAuth);
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
        limit: "100",
        syncIncoming: "1",
      });
      if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);
      const res = await fetch(`/api/savings/notifications?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json()) as {
        notifications?: SavingsNotificationRecord[];
        unreadCount?: number;
        message?: string;
      };
      if (!res.ok) {
        setItems([]);
        setUnreadCount(0);
        if (res.status === 401) {
          setWalletAuthorized(false);
          setAuthHint(json.message ?? "Authorize this wallet to manage alerts.");
        }
        return;
      }
      setWalletAuthorized(true);
      setAuthHint(null);
      setItems(json.notifications ?? []);
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, [circleSocialUuid, ownerWallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const category = getAlertInboxCategory(item);
      if (filter !== "all" && category !== filter) return false;
      if (!needle) return true;
      const hay = `${item.title} ${cleanBody(item)} ${item.kind}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [filter, items, prefs.categories, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SavingsNotificationRecord[]>();
    for (const item of filtered) {
      const label = groupLabel(item.created_at);
      const list = groups.get(label) ?? [];
      list.push(item);
      groups.set(label, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const pulse = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const moneyIn = items.filter(
      (item) =>
        getAlertInboxCategory(item) === "payments" &&
        new Date(item.created_at).getTime() >= weekAgo,
    ).length;
    const actionNeeded = items.filter(
      (item) => isImportant(item) && !item.read_at,
    ).length;
    const savings = items.filter(
      (item) => getAlertInboxCategory(item) === "savings",
    ).length;
    return { moneyIn, actionNeeded, savings };
  }, [items]);

  function savePrefs(next: AlertPreferences) {
    setPrefs(writeAlertPreferences(next));
  }

  async function markAllRead() {
    if (!ownerWallet || unreadCount === 0) return;
    setActing("read");
    try {
      await fetch("/api/savings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ownerWallet, circleSocialUuid }),
      });
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((item) =>
          item.read_at ? item : { ...item, read_at: now },
        ),
      );
      setUnreadCount(0);
      toast.success("All alerts marked read");
    } catch {
      toast.error("Could not mark alerts read");
    } finally {
      setActing(null);
    }
  }

  async function remove(options: {
    ids?: string[];
    all?: boolean;
    olderThanDays?: number;
    keepImportant?: boolean;
    success: string;
  }) {
    if (!ownerWallet) return;
    setActing(options.all ? "clear" : options.olderThanDays ? "sweep" : "delete");
    try {
      const result = await deleteSavingsNotifications({
        ownerWallet,
        circleSocialUuid,
        ids: options.ids,
        all: options.all,
        olderThanDays: options.olderThanDays,
        keepImportant: options.keepImportant,
      });
      setItems(result.notifications ?? []);
      setUnreadCount(result.unreadCount ?? 0);
      setConfirmClear(false);
      toast.success(options.success, {
        description:
          result.deleted > 0
            ? `${result.deleted} notification${result.deleted === 1 ? "" : "s"} removed.`
            : "Inbox already clean.",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update inbox.",
      );
    } finally {
      setActing(null);
    }
  }

  const quietNow = isWithinQuietHours(prefs);
  const hasIdentity = Boolean(ownerWallet);

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-4">
        <PulseCard label="Unread" value={String(unreadCount)} />
        <PulseCard
          label="Needs a reply"
          value={String(pulse.actionNeeded)}
          hint="Open claims & requests"
        />
        <PulseCard
          label="Money in · 7d"
          value={String(pulse.moneyIn)}
          hint="Incoming payments"
        />
        <PulseCard
          label="Savings notes"
          value={String(pulse.savings)}
          hint="Pockets and locks"
        />
      </div>

      <section className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">How you get pinged</p>
            <p className="text-xs text-muted-foreground">
              These rules only change toasts and what this inbox highlights.
              On-chain money still arrives.
            </p>
          </div>
          {quietNow ? (
            <Badge variant="secondary">Quiet hours on</Badge>
          ) : null}
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm">
          <span>
            <span className="font-medium">Live toasts</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Pop a notice when money, a claim, or a request lands.
            </span>
          </span>
          <input
            checked={prefs.toasts}
            onChange={(event) =>
              savePrefs({ ...prefs, toasts: event.target.checked })
            }
            type="checkbox"
          />
        </label>

        <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">Quiet hours</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Mute toasts overnight. The inbox still fills.
              </span>
            </span>
            <input
              checked={prefs.quietHoursEnabled}
              onChange={(event) =>
                savePrefs({
                  ...prefs,
                  quietHoursEnabled: event.target.checked,
                })
              }
              type="checkbox"
            />
          </label>
          {prefs.quietHoursEnabled ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">
                From
                <Input
                  className="mt-1 h-9"
                  onChange={(event) =>
                    savePrefs({
                      ...prefs,
                      quietHoursStart: event.target.value,
                    })
                  }
                  type="time"
                  value={prefs.quietHoursStart}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Until
                <Input
                  className="mt-1 h-9"
                  onChange={(event) =>
                    savePrefs({
                      ...prefs,
                      quietHoursEnd: event.target.value,
                    })
                  }
                  type="time"
                  value={prefs.quietHoursEnd}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(prefs.categories) as AlertCategory[]).map((key) => (
            <label
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              key={key}
            >
              <span>
                <span className="font-medium">{categoryMeta[key].label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {categoryMeta[key].hint}
                </span>
              </span>
              <input
                checked={prefs.categories[key]}
                onChange={(event) =>
                  savePrefs({
                    ...prefs,
                    categories: {
                      ...prefs.categories,
                      [key]: event.target.checked,
                    },
                  })
                }
                type="checkbox"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Inbox</p>
            <p className="text-xs text-muted-foreground">
              Delete one, sweep stale noise, or clear everything.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!hasIdentity || unreadCount === 0 || acting !== null}
              onClick={() => void markAllRead()}
              size="sm"
              type="button"
              variant="outline"
            >
              {acting === "read" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              )}
              Mark read
            </Button>
            <Button
              disabled={!hasIdentity || items.length === 0 || acting !== null}
              onClick={() =>
                void remove({
                  olderThanDays: 7,
                  keepImportant: true,
                  success: "Swept older alerts",
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {acting === "sweep" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Sweep 7d+
            </Button>
            <Button
              disabled={!hasIdentity || items.length === 0 || acting !== null}
              onClick={() => setConfirmClear((value) => !value)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear all
            </Button>
          </div>
        </div>

        {confirmClear ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm">
            <p className="font-medium">Clear the whole inbox?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This permanently deletes notifications for this wallet. Claim
              codes and request links disappear from here too — copy anything
              you still need first.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={acting !== null}
                onClick={() =>
                  void remove({
                    all: true,
                    success: "Inbox cleared",
                  })
                }
                size="sm"
                type="button"
                variant="destructive"
              >
                {acting === "clear" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Delete everything
              </Button>
              <Button
                disabled={acting !== null}
                onClick={() =>
                  void remove({
                    all: true,
                    keepImportant: true,
                    success: "Cleared, kept claims & requests",
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Keep claims & requests
              </Button>
              <Button
                onClick={() => setConfirmClear(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search alerts"
              value={query}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              ["all", "payments", "requests", "savings", "claims"] as const
            ).map((key) => (
              <button
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  filter === key
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40",
                )}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {key === "all" ? (
                  <Filter className="mr-1 h-3 w-3" />
                ) : null}
                {categoryMeta[key].label}
              </button>
            ))}
          </div>
        </div>

        {!hasIdentity ? (
          <EmptyInbox
            icon={Bell}
            title="Connect to see alerts"
            body="Sign in with Google or an external wallet to load this inbox."
          />
        ) : authHint && !walletAuthorized ? (
          <EmptyInbox icon={Bell} title="Authorize wallet" body={authHint} />
        ) : loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading alerts…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyInbox
            icon={Inbox}
            title="Nothing in this view"
            body={
              items.length === 0
                ? "Incoming payments, claims, requests, and savings updates land here."
                : "Try another filter, or turn a muted category back on."
            }
          />
        ) : (
          <div className="space-y-4">
            {grouped.map(([label, rows]) => (
              <div key={label}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80">
                  {rows.map((item) => {
                    const category = getAlertInboxCategory(item);
                    const claimCode = extractClaimCodeFromNotification(item);
                    const requestId = extractPaymentRequestId(item);
                    return (
                      <li
                        className={cn(
                          "flex items-start gap-3 px-3 py-3",
                          item.read_at ? "bg-background" : "bg-primary/5",
                        )}
                        key={item.id}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            category === "payments"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : category === "requests"
                                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                                : category === "claims"
                                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                                  : "bg-muted text-muted-foreground",
                          )}
                        >
                          {category === "payments" ? (
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                          ) : category === "requests" ? (
                            <ReceiptText className="h-3.5 w-3.5" />
                          ) : category === "claims" ? (
                            <LockKeyhole className="h-3.5 w-3.5" />
                          ) : (
                            <PiggyBank className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">
                              {item.title}
                              {!item.read_at ? (
                                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
                              ) : null}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {relativeTime(item.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {cleanBody(item)}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {categoryMeta[category].label}
                            </span>
                            {item.pocket_id ? (
                              <Link
                                className="text-[11px] font-medium text-primary hover:underline"
                                href={`/save/${item.pocket_id}`}
                              >
                                Open pocket
                              </Link>
                            ) : null}
                            {claimCode ? (
                              <Link
                                className="text-[11px] font-medium text-primary hover:underline"
                                href={`/privSwiftPay/claim?code=${encodeURIComponent(claimCode)}`}
                              >
                                Open claim
                              </Link>
                            ) : null}
                            {requestId ? (
                              <Link
                                className="text-[11px] font-medium text-primary hover:underline"
                                href={`/dashboard?request=${encodeURIComponent(requestId)}`}
                              >
                                Open request
                              </Link>
                            ) : null}
                            <button
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400"
                              disabled={acting !== null}
                              onClick={() =>
                                void remove({
                                  ids: [item.id],
                                  success: "Alert deleted",
                                })
                              }
                              type="button"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function defaultPrefsSafe() {
  return {
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
  } satisfies AlertPreferences;
}

function PulseCard({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          Live
        </p>
      )}
    </div>
  );
}

function EmptyInbox({
  body,
  icon: Icon,
  title,
}: {
  body: string;
  icon: typeof Bell;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
