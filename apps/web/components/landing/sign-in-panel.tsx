"use client";

import { ArrowRight, Loader2, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { CircleGoogleLogin } from "@/components/circle-google-login";
import { useT } from "@/components/locale-provider";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { writeActivatedExternalProfile } from "@/lib/platform-access";
import { ensureProfile } from "@/lib/profile";
import {
  fetchWalletSessionForAddress,
  signInWalletSession,
  walletSessionChangedEventName,
} from "@/lib/wallet-auth-client";

export function SignInPanel() {
  const t = useT();
  const router = useRouter();
  const { address, isConnected, connector } = useAccount();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const [externalConnectStarted, setExternalConnectStarted] = useState(false);
  const [walletAuthorized, setWalletAuthorized] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authorizeInFlightRef = useRef(false);

  const refreshSession = useCallback(async () => {
    if (!isConnected || !address) {
      setWalletAuthorized(false);
      setIsCheckingSession(false);
      return;
    }

    setIsCheckingSession(true);
    try {
      const session = await fetchWalletSessionForAddress(address);
      setWalletAuthorized(Boolean(session.authenticated && session.ownerWallet));
    } catch {
      setWalletAuthorized(false);
    } finally {
      setIsCheckingSession(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (externalConnectStarted && isConnected && address) {
      writeActivatedExternalProfile(address);
      void ensureProfile({
        authProvider: "external",
        walletAddress: address,
      }).catch(() => undefined);
      setExternalConnectStarted(false);
    }
  }, [address, externalConnectStarted, isConnected]);

  useEffect(() => {
    void refreshSession();

    function onSessionChange() {
      void refreshSession();
    }

    window.addEventListener(walletSessionChangedEventName, onSessionChange);
    return () => {
      window.removeEventListener(walletSessionChangedEventName, onSessionChange);
    };
  }, [refreshSession]);

  async function handleAuthorizeWallet() {
    if (!isConnected || !address) {
      return;
    }

    if (authorizeInFlightRef.current) {
      return;
    }

    authorizeInFlightRef.current = true;
    setIsAuthorizing(true);
    setAuthError(null);
    try {
      writeActivatedExternalProfile(address);
      await ensureProfile({
        authProvider: "external",
        walletAddress: address,
      }).catch(() => undefined);

      await signInWalletSession({
        connectorName: connector?.name,
        ownerWallet: address,
        signMessage: (message) => signMessageAsync({ message }),
      });
      setWalletAuthorized(true);
      router.replace("/dashboard");
    } catch (error) {
      setWalletAuthorized(false);
      setAuthError(
        error instanceof Error
          ? error.message
          : "Wallet authorization was cancelled or failed.",
      );
    } finally {
      authorizeInFlightRef.current = false;
      setIsAuthorizing(false);
    }
  }

  const busy = isAuthorizing || isSigning || isCheckingSession;

  return (
    <div className="sign-in-panel" id="sign-in">
      <div className="sign-in-panel-header">
        <p className="section-eyebrow">{t("signin.getStarted")}</p>
        <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight">
          {t("signin.chooseHow")}
        </h2>
      </div>

      <div className="sign-in-option">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t("signin.externalWallet")}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("signin.externalWalletBody")}
        </p>
        <div className="mt-3">
          <WalletConnectButton
            className="w-full"
            fullWidth
            onConnectIntent={() => setExternalConnectStarted(true)}
            variant="outline"
          />
        </div>

        {isConnected && address ? (
          <div className="mt-2 grid gap-2">
            {authError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {authError}
              </p>
            ) : null}

            {walletAuthorized ? (
              <Button asChild className="w-full" size="lg">
                <Link href="/dashboard">
                  {t("signin.continueDashboard")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() => void handleAuthorizeWallet()}
                  size="lg"
                  type="button"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {isCheckingSession
                    ? t("signin.checkingAuth")
                    : isAuthorizing || isSigning
                      ? t("signin.confirmInWallet")
                      : t("common.authorizeWallet")}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  {t("signin.authorizeHint")}
                </p>
                {/* Disabled affordance so users see Continue exists but is locked */}
                <Button
                  aria-disabled
                  className="w-full opacity-50"
                  disabled
                  size="lg"
                  type="button"
                  variant="outline"
                >
                  {t("signin.continueDashboard")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="sign-in-divider">
        <Separator className="flex-1" />
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          {t("common.or")}
        </span>
        <Separator className="flex-1" />
      </div>

      <CircleGoogleLogin embedded showRefreshWallet={false} />
    </div>
  );
}
