"use client";

import {
  ChevronDown,
  CheckCircle2,
  Copy,
  LogOut,
  Mail,
  UserCircle,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  callCircleWalletApi,
  circleSessionEventName,
  clearCircleSession,
  getCircleLoginIdentity,
  readCircleWallets,
  readCircleLogin,
  shortenCircleAddress,
  type CircleLoginResult,
  type CircleWallet,
  writeCircleWallets,
} from "@/lib/circle-session";
import {
  clearActivatedExternalProfile,
  markPlatformProfileConnected,
  platformAccessEventName,
  readActivatedExternalProfile,
  writeActivatedExternalProfile,
} from "@/lib/platform-access";
import {
  ensureProfile,
  fetchProfile,
  formatUsernameLabel,
  profileUpdatedEventName,
  type ProfileRecord,
} from "@/lib/profile";

export type WalletMode = "circle" | "external";

type ProfileMenuProps = {
  circleLogin?: CircleLoginResult | null;
  circleWalletAddress?: string;
  externalAddress?: string;
  externalWalletAction?: ReactNode;
  onCircleSessionCleared?: () => void;
  onWalletModeChange?: (mode: WalletMode) => void;
  walletMode?: WalletMode;
};

function GoogleLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function ProfileMenu({
  circleLogin,
  circleWalletAddress,
  externalAddress,
  externalWalletAction,
  onCircleSessionCleared,
  onWalletModeChange,
  walletMode,
}: ProfileMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [storedLogin, setStoredLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [activatedExternalProfile, setActivatedExternalProfile] = useState("");
  const [loadedCircleWalletAddress, setLoadedCircleWalletAddress] =
    useState("");
  const [copied, setCopied] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const activeLogin = circleLogin === undefined ? storedLogin : circleLogin;
  const identity = getCircleLoginIdentity(activeLogin);
  const resolvedCircleWalletAddress =
    circleWalletAddress ?? loadedCircleWalletAddress;
  const activeMode =
    walletMode ??
    (activeLogin || resolvedCircleWalletAddress ? "circle" : "external");
  const activeAddress =
    activeMode === "circle" ? resolvedCircleWalletAddress : externalAddress;
  const normalizedExternalAddress = externalAddress?.toLowerCase() ?? "";
  const isActivatedExternalWallet = Boolean(
    normalizedExternalAddress &&
      activatedExternalProfile === normalizedExternalAddress,
  );
  const isCurrentExternalWallet = Boolean(
    externalAddress && activeMode === "external",
  );
  const googleLabel = useMemo(() => {
    if (!activeLogin) {
      return "No Google account connected";
    }

    return identity.email ?? identity.name ?? "Google account connected";
  }, [activeLogin, identity.email, identity.name]);
  const buttonLabel = profile?.username
    ? `@${profile.username}`
    : isCurrentExternalWallet && activeAddress
      ? shortenCircleAddress(activeAddress)
      : identity.email ??
        identity.name ??
        (activeAddress
          ? shortenCircleAddress(activeAddress)
          : externalAddress
            ? shortenCircleAddress(externalAddress)
            : "Account");
  const profileProviderLabel = activeLogin
    ? identity.provider
    : externalAddress
      ? "External wallet"
      : "Google";
  const profilePrimaryLabel = profile?.username
    ? `@${profile.username}`
    : activeLogin
      ? googleLabel
      : externalAddress
        ? isActivatedExternalWallet
          ? "Wallet profile active"
          : "Wallet connected"
        : googleLabel;
  const profileSecondaryLabel = profile?.username
    ? activeLogin
      ? (identity.email ?? identity.name ?? "")
      : externalAddress
        ? shortenCircleAddress(externalAddress)
        : activeAddress
          ? shortenCircleAddress(activeAddress)
          : ""
    : activeLogin && identity.name && identity.email
      ? identity.name
      : externalAddress
        ? shortenCircleAddress(externalAddress)
        : "";
  const shouldShowExternalWalletAction = Boolean(
    externalAddress &&
      onWalletModeChange &&
      (!isActivatedExternalWallet || activeMode !== "external"),
  );
  const externalWalletActionLabel =
    activeMode === "external" ? "Continue with this wallet" : "Switch to wallet";

  useEffect(() => {
    function refreshStoredLogin() {
      const login = readCircleLogin();

      if (login) {
        markPlatformProfileConnected();
      }

      setStoredLogin(login);
    }

    refreshStoredLogin();
    window.addEventListener(circleSessionEventName, refreshStoredLogin);
    window.addEventListener("storage", refreshStoredLogin);

    return () => {
      window.removeEventListener(circleSessionEventName, refreshStoredLogin);
      window.removeEventListener("storage", refreshStoredLogin);
    };
  }, []);

  useEffect(() => {
    function refreshActivatedExternalProfile() {
      setActivatedExternalProfile(readActivatedExternalProfile());
    }

    refreshActivatedExternalProfile();
    window.addEventListener(
      platformAccessEventName,
      refreshActivatedExternalProfile,
    );
    window.addEventListener("storage", refreshActivatedExternalProfile);

    return () => {
      window.removeEventListener(
        platformAccessEventName,
        refreshActivatedExternalProfile,
      );
      window.removeEventListener("storage", refreshActivatedExternalProfile);
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCircleWalletAddress() {
      if (!activeLogin?.userToken || circleWalletAddress !== undefined) {
        setLoadedCircleWalletAddress("");
        return;
      }

      const cachedWalletAddress = readCircleWallets()[0]?.address ?? "";

      if (cachedWalletAddress) {
        setLoadedCircleWalletAddress(cachedWalletAddress);
      }

      try {
        const payload = await callCircleWalletApi<{ wallets?: CircleWallet[] }>(
          "listWallets",
          {
            userToken: activeLogin.userToken,
          },
        );
        const wallets = payload.wallets ?? [];
        const walletAddress = wallets[0]?.address ?? "";

        if (!cancelled) {
          setLoadedCircleWalletAddress(walletAddress);
          writeCircleWallets(wallets);
        }
      } catch {
        if (!cancelled && !cachedWalletAddress) {
          setLoadedCircleWalletAddress("");
        }
      }
    }

    void loadCircleWalletAddress();

    return () => {
      cancelled = true;
    };
  }, [activeLogin?.userToken, circleWalletAddress]);

  useEffect(() => {
    let cancelled = false;
    const walletAddress =
      activeMode === "circle"
        ? resolvedCircleWalletAddress
        : isActivatedExternalWallet
          ? normalizedExternalAddress
          : "";

    async function loadProfile() {
      if (!walletAddress) {
        if (!cancelled) {
          setProfile(null);
        }
        return;
      }

      try {
        let nextProfile = await fetchProfile(walletAddress);

        if (!nextProfile) {
          nextProfile = await ensureProfile({
            authProvider: activeLogin ? "google" : "external",
            circleSocialUuid: identity.socialUserUUID,
            displayName: identity.name,
            walletAddress,
          });
        }

        if (!cancelled) {
          setProfile(nextProfile);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [
    activeLogin,
    activeMode,
    identity.name,
    identity.socialUserUUID,
    isActivatedExternalWallet,
    normalizedExternalAddress,
    resolvedCircleWalletAddress,
  ]);

  useEffect(() => {
    function handleProfileUpdated(event: Event) {
      const customEvent = event as CustomEvent<ProfileRecord>;
      const updatedProfile = customEvent.detail;
      const walletAddress =
        activeMode === "circle"
          ? resolvedCircleWalletAddress?.toLowerCase()
          : normalizedExternalAddress;

      if (
        updatedProfile?.wallet_address?.toLowerCase() === walletAddress
      ) {
        setProfile(updatedProfile);
      }
    }

    window.addEventListener(profileUpdatedEventName, handleProfileUpdated);

    return () => {
      window.removeEventListener(
        profileUpdatedEventName,
        handleProfileUpdated,
      );
    };
  }, [
    activeMode,
    normalizedExternalAddress,
    resolvedCircleWalletAddress,
  ]);

  function handleSignOut() {
    clearCircleSession();
    clearActivatedExternalProfile();
    setOpen(false);
    setStoredLogin(null);
    setLoadedCircleWalletAddress("");
    setProfile(null);
    onCircleSessionCleared?.();
    router.replace("/");
  }

  function selectExternalWallet() {
    if (externalAddress) {
      writeActivatedExternalProfile(externalAddress);
      void ensureProfile({
        authProvider: "external",
        walletAddress: externalAddress,
      }).catch(() => undefined);
    }

    onWalletModeChange?.("external");
    setOpen(false);
  }

  async function copyAddress(value?: string) {
    if (!value || typeof navigator === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copyUsername(username: string) {
    if (typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatUsernameLabel(username));
      setCopiedUsername(true);
      window.setTimeout(() => setCopiedUsername(false), 1600);
    } catch {
      setCopiedUsername(false);
    }
  }

  return (
    <div className="relative z-[90]" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="font-ui inline-flex h-11 max-w-[13rem] items-center justify-center gap-2 rounded-lg bg-swift-600 px-3 text-sm font-bold text-white shadow-[0_14px_32px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <UserCircle className="h-4 w-4 shrink-0" />
        <span className="hidden min-w-0 truncate sm:inline">{buttonLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/75" />
      </button>

      {open ? (
        <div
          className="fixed left-2 right-2 top-20 z-[100] max-h-[calc(100vh-6rem)] w-auto overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg sm:left-auto sm:right-4 sm:w-[min(22rem,calc(100vw-2rem))] lg:absolute lg:right-0 lg:top-[calc(100%+0.5rem)]"
          role="menu"
        >
          <div className="rounded-lg border border-border bg-muted px-3 py-3">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
                {activeLogin ? (
                  <Mail className="h-4 w-4" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">
                  {profileProviderLabel}
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-bold text-foreground">
                    {profilePrimaryLabel}
                  </p>
                  {profile?.username ? (
                    <button
                      aria-label="Copy username"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition hover:border-primary/30 hover:text-primary"
                      onClick={() => void copyUsername(profile.username)}
                      type="button"
                    >
                      {copiedUsername ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : null}
                </div>
                {profileSecondaryLabel ? (
                  <p className="mt-1 truncate text-xs font-semibold text-muted">
                    {profileSecondaryLabel}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-sm">
            <div className="rounded-lg border border-border px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-muted-foreground">Circle wallet</span>
                <button
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
                  disabled={!resolvedCircleWalletAddress}
                  onClick={() => void copyAddress(resolvedCircleWalletAddress)}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 break-all font-mono text-xs font-bold text-foreground">
                {resolvedCircleWalletAddress || "Not connected"}
              </p>
            </div>

            {!activeLogin ? (
              <div className="rounded-lg border border-border px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted-foreground">
                    External wallet
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {shortenCircleAddress(externalAddress)}
                  </span>
                </div>
                {shouldShowExternalWalletAction ? (
                  <button
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(66,17,143,0.18)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                    onClick={selectExternalWallet}
                    type="button"
                  >
                    <Wallet className="h-4 w-4" />
                    {externalWalletActionLabel}
                  </button>
                ) : externalAddress ? (
                  <div className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    External wallet active
                  </div>
                ) : null}
                {externalWalletAction ? (
                  <div className="mt-3">{externalWalletAction}</div>
                ) : (
                  <Link
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 active:translate-y-0"
                    href="/dashboard"
                  >
                    <Wallet className="h-4 w-4" />
                    Open wallet options
                  </Link>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2">
            {activeLogin ? (
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-500/15 active:translate-y-0 dark:text-rose-400"
                onClick={handleSignOut}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Sign out Google
              </button>
            ) : (
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 active:translate-y-0"
                href="/#google-login"
              >
                <GoogleLogo />
                Google login
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
