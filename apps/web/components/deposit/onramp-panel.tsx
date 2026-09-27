"use client";

import { Banknote, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { onchainFacts } from "@/lib/onchain-facts";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

type OnrampModule = typeof import("@circle-fin/onramp-kit");
type OnrampKit = ReturnType<OnrampModule["createOnrampKit"]>;
type OnrampSession = ReturnType<OnrampModule["parseOnrampSession"]>;
type OnrampWidget = ReturnType<OnrampKit["mountIframe"]>;

/**
 * Buy USDC with a bank transfer through Circle's Onramp, paid straight into
 * the signed-in wallet on Arc.
 *
 * The widget opens in a popup (its own window or, on phones, a tab): popups
 * must open synchronously on the tap, so a session is fetched before it.
 * Where popups can't open — the installed app, in-app browsers — it renders
 * inline instead.
 */
export function OnrampPanel() {
  const { address, isConnected } = usePlatformWallet();
  const kitRef = useRef<OnrampKit | null>(null);
  const moduleRef = useRef<OnrampModule | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<OnrampSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inline, setInline] = useState(false);
  const [settled, setSettled] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const onramp = moduleRef.current ?? (await import("@circle-fin/onramp-kit"));
      moduleRef.current = onramp;
      kitRef.current ??= onramp.createOnrampKit();

      const response = await fetch("/api/onramp/sessions", {
        body: JSON.stringify({ appUserId: address, destinationAddress: address }),
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "Couldn't start the purchase.");
      }
      setSession(onramp.parseOnrampSession(payload));
    } catch (cause) {
      setSession(null);
      setError(cause instanceof Error ? cause.message : "Couldn't start the purchase.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    setSession(null);
    setInline(false);
    setSettled(null);
    void loadSession();
  }, [loadSession]);

  const onDepositSettled = useCallback(
    ({ payload }: { payload?: { amount?: unknown; tokenSymbol?: unknown } }) => {
      const amount = payload?.amount != null ? String(payload.amount) : "";
      const token = payload?.tokenSymbol != null ? String(payload.tokenSymbol) : "USDC";
      setSettled(amount ? `${amount} ${token}` : token);
    },
    [],
  );

  // Inline fallback: mount once the container is on the page.
  useEffect(() => {
    const kit = kitRef.current;
    const container = containerRef.current;
    if (!inline || !kit || !session || !container) return;

    let widget: OnrampWidget | null = kit.mountIframe({
      container,
      onDepositSettled,
      onSessionExpired: () => {
        widget?.close();
        widget = null;
        setInline(false);
        void loadSession();
      },
      session,
    });
    return () => {
      widget?.close();
    };
  }, [inline, loadSession, onDepositSettled, session]);

  function openOnramp() {
    const kit = kitRef.current;
    if (!kit || !session) return;
    setError(null);
    setSettled(null);

    // Synchronous on the tap, or the browser blocks the popup.
    const result = kit.openWindow({ onDepositSettled, session });
    if (result.status === "blocked") {
      if (result.reason === "popup_blocked") {
        setError("Your browser blocked the window. Allow pop-ups for SwiftPay and tap again.");
      } else {
        setInline(true);
      }
      return;
    }
    // Each session is for one launch: have a fresh one ready for the next tap.
    void loadSession();
  }

  return (
    <section className="section-panel">
      <p className="section-eyebrow">Buy USDC</p>
      <h2 className="section-title">Bank transfer</h2>
      <p className="section-copy">
        Pay from your bank and receive USDC in your SwiftPay wallet on{" "}
        {onchainFacts.chain.name}. Circle handles the payment and identity
        check. Available in the US and supported European countries.
      </p>

      {!isConnected || !address ? (
        <div className="mt-5">
          <WalletConnectButton />
        </div>
      ) : inline ? (
        <div className="mt-5 h-[680px] overflow-hidden rounded-lg border border-border" ref={containerRef} />
      ) : (
        <div className="mt-5 grid gap-3">
          <Button
            className="h-12 w-full sm:w-auto"
            disabled={!session || loading}
            onClick={openOnramp}
            type="button"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            Buy USDC
          </Button>
          {error ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              <span>{error}</span>
              {!session && !loading ? (
                <button className="font-semibold underline" onClick={() => void loadSession()} type="button">
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {settled ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {settled} is on its way to your wallet.
        </p>
      ) : null}
    </section>
  );
}
