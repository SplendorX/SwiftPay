"use client";

import {
  ChevronDown,
  Copy,
  LogOut,
  Mail,
  UserCircle,
  Wallet,
} from "lucide-react";
import Link from "next/link";
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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [storedLogin, setStoredLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [loadedCircleWalletAddress, setLoadedCircleWalletAddress] =
    useState("");
  const [copied, setCopied] = useState(false);
  const activeLogin = circleLogin === undefined ? storedLogin : circleLogin;
  const identity = getCircleLoginIdentity(activeLogin);
  const resolvedCircleWalletAddress =
    circleWalletAddress ?? loadedCircleWalletAddress;
  const activeMode =
    walletMode ??
    (activeLogin || resolvedCircleWalletAddress ? "circle" : "external");
  const activeAddress =
    activeMode === "circle" ? resolvedCircleWalletAddress : externalAddress;
  const buttonLabel =
    identity.email ??
    identity.name ??
    (activeAddress
      ? shortenCircleAddress(activeAddress)
      : externalAddress
        ? shortenCircleAddress(externalAddress)
        : "Account");
  const googleLabel = useMemo(() => {
    if (!activeLogin) {
      return "No Google account connected";
    }

    return identity.email ?? identity.name ?? "Google account connected";
  }, [activeLogin, identity.email, identity.name]);

  useEffect(() => {
    function refreshStoredLogin() {
      setStoredLogin(readCircleLogin());
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

  function handleSignOut() {
    clearCircleSession();
    setOpen(false);
    setStoredLogin(null);
    setLoadedCircleWalletAddress("");
    onCircleSessionCleared?.();
    onWalletModeChange?.("external");
  }

  async function copyAddress(value?: string) {
    if (!value || typeof navigator === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="relative z-[90]" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="font-ui inline-flex h-11 max-w-[13rem] items-center justify-center gap-2 rounded-lg bg-ink px-3 text-sm font-bold text-white shadow-[0_14px_32px_rgba(17,24,39,0.18)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <UserCircle className="h-4 w-4 shrink-0" />
        <span className="hidden min-w-0 truncate sm:inline">{buttonLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/75" />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-lavender-200 bg-white p-3 text-ink shadow-[0_22px_70px_rgba(18,11,32,0.22)]"
          role="menu"
        >
          <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-3">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-muted">
                  {identity.provider}
                </p>
                <p className="mt-1 truncate text-sm font-bold text-ink">
                  {googleLabel}
                </p>
                {identity.name && identity.email ? (
                  <p className="mt-1 truncate text-xs font-semibold text-muted">
                    {identity.name}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-sm">
            <div className="rounded-lg border border-lavender-100 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-muted">Circle wallet</span>
                <button
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-lavender-100 bg-white px-2 text-xs font-bold text-ink transition hover:border-swift-600 hover:text-swift-700 disabled:cursor-not-allowed disabled:text-muted"
                  disabled={!resolvedCircleWalletAddress}
                  onClick={() => void copyAddress(resolvedCircleWalletAddress)}
                  type="button"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 break-all font-mono text-xs font-bold text-ink">
                {resolvedCircleWalletAddress || "Not connected"}
              </p>
            </div>

            {!activeLogin ? (
              <div className="rounded-lg border border-lavender-100 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">
                    External wallet
                  </span>
                  <span className="font-mono text-xs font-bold text-ink">
                    {shortenCircleAddress(externalAddress)}
                  </span>
                </div>
                {externalWalletAction ? (
                  <div className="mt-3">{externalWalletAction}</div>
                ) : (
                  <Link
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 active:translate-y-0"
                onClick={handleSignOut}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Sign out Google
              </button>
            ) : (
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
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
