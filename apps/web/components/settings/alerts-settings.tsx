"use client";

import { Bell, CheckCheck, Clock3, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { useT } from "@/components/locale-provider";
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
import { rememberDismissedAlertHashes } from "@/lib/notifications/dismissed";
import {
  deleteSavingsNotifications,
  emitNotificationsChanged,
} from "@/lib/save/client";
import {
  fetchWalletSessionForAddress,
  walletSessionChangedEventName,
} from "@/lib/wallet-auth-client";

export function AlertsSettings() {
  const t = useT();
  const { address: wagmiAddress, isConnected } = useAccount();
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleWalletAddress, setCircleWalletAddress] = useState("");
  const [walletAuthorized, setWalletAuthorized] = useState(false);
  const [prefs, setPrefs] = useState<AlertPreferences>(defaultPrefsSafe);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readCount, setReadCount] = useState(0);
  const [readHashes, setReadHashes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);

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

  const loadCounts = useCallback(async () => {
    if (!ownerWallet) {
      setUnreadCount(0);
      setReadCount(0);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ownerWallet,
        limit: "100",
        syncIncoming: "0",
      });
      if (circleSocialUuid) params.set("circleSocialUuid", circleSocialUuid);
      const res = await fetch(`/api/savings/notifications?${params}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json()) as {
        notifications?: Array<{
          read_at: string | null;
          related_tx_hash?: string | null;
        }>;
        unreadCount?: number;
        message?: string;
      };
      if (!res.ok) {
        setUnreadCount(0);
        setReadCount(0);
        if (res.status === 401) {
          setWalletAuthorized(false);
          setAuthHint(json.message ?? "Authorize this wallet to manage alerts.");
        }
        return;
      }
      setWalletAuthorized(true);
      setAuthHint(null);
      const items = json.notifications ?? [];
      const readItems = items.filter((item) => item.read_at);
      setUnreadCount(json.unreadCount ?? items.filter((item) => !item.read_at).length);
      setReadCount(readItems.length);
      setReadHashes(
        readItems
          .map((item) => item.related_tx_hash?.toLowerCase() ?? "")
          .filter(Boolean),
      );
    } catch {
      setUnreadCount(0);
      setReadCount(0);
    } finally {
      setLoading(false);
    }
  }, [circleSocialUuid, ownerWallet]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

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
      setReadCount((count) => count + unreadCount);
      setUnreadCount(0);
      emitNotificationsChanged();
      toast.success(t("settings.allMarkedRead"));
    } catch {
      toast.error(t("settings.couldNotMarkRead"));
    } finally {
      setActing(null);
    }
  }

  async function clearRead() {
    if (!ownerWallet || readCount === 0) return;
    setActing("clear");
    try {
      rememberDismissedAlertHashes(ownerWallet, readHashes);
      const result = await deleteSavingsNotifications({
        ownerWallet,
        circleSocialUuid,
        onlyRead: true,
      });
      setReadCount(0);
      setReadHashes([]);
      if (typeof result.unreadCount === "number") {
        setUnreadCount(result.unreadCount);
      }
      toast.success(t("settings.clearedRead"), {
        description:
          result.deleted > 0
            ? `${result.deleted} read notification${result.deleted === 1 ? "" : "s"} removed.`
            : "No read notifications to clear.",
      });
      await loadCounts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear read alerts.",
      );
    } finally {
      setActing(null);
    }
  }

  const quietNow = isWithinQuietHours(prefs);
  const hasIdentity = Boolean(ownerWallet);

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t("settings.howPinged")}</p>
            <p className="text-xs text-muted-foreground">
              {t("settings.howPingedBody")}
            </p>
          </div>
          {quietNow ? (
            <Badge variant="secondary">{t("settings.quietHoursOn")}</Badge>
          ) : null}
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{t("settings.liveToasts")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t("settings.liveToastsBody")}
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
              <span className="font-medium">{t("settings.quietHours")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("settings.quietHoursBody")}
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
                {t("common.from")}
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
                {t("common.until")}
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
                <span className="font-medium">
                  {key === "payments"
                    ? t("settings.moneyIn")
                    : key === "requests"
                      ? t("settings.requests")
                      : t("settings.savings")}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {key === "payments"
                    ? t("settings.moneyInHint")
                    : key === "requests"
                      ? t("settings.requestsHint")
                      : t("settings.savingsHint")}
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

      <section className="space-y-3 rounded-xl border border-border/80 bg-background p-3">
        <div>
          <p className="text-sm font-semibold">{t("settings.clearReadTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.clearReadBody")}
          </p>
        </div>

        {!hasIdentity ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">{t("settings.connectToManage")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.connectToManageBody")}
            </p>
          </div>
        ) : authHint && !walletAuthorized ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">{t("settings.authorizeWalletTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{authHint}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border/80 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t("settings.unread")}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {loading ? "n/a" : unreadCount}
                </p>
                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  {t("settings.stillInBell")}
                </p>
              </div>
              <div className="rounded-xl border border-border/80 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t("settings.read")}</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">
                  {loading ? "n/a" : readCount}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.safeToClear")}
                </p>
              </div>
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
                {t("settings.markAllRead")}
              </Button>
              <Button
                disabled={!hasIdentity || readCount === 0 || acting !== null}
                onClick={() => void clearRead()}
                size="sm"
                type="button"
                variant="outline"
              >
                {acting === "clear" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("settings.clearRead")}
              </Button>
            </div>
          </>
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
    },
  } satisfies AlertPreferences;
}
