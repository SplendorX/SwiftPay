"use client";

import { Banknote, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/account/money";
import { createChargeOnrampSession, reportChargeSettled } from "@/lib/checkout/client";
import type { PublicChargePayload } from "@/lib/checkout/types";

type OnrampModule = typeof import("@circle-fin/onramp-kit");
type OnrampKit = ReturnType<OnrampModule["createOnrampKit"]>;
type OnrampSession = ReturnType<OnrampModule["parseOnrampSession"]>;
type OnrampWidget = ReturnType<OnrampKit["mountIframe"]>;

/**
 * Pay a charge by card or bank through Circle Onramp: USDC on Arc goes
 * straight to the business. The payment arrives without a hash this page can
 * confirm, so the server matches it when it lands (see lib/checkout/match).
 *
 * The widget opens in a popup, which must open synchronously on the tap, so
 * the session is fetched first. Where popups can't open it renders inline.
 */
export function PayWithOnramp({
  payload,
  total,
  onUpdate,
}: {
  payload: PublicChargePayload;
  total: string;
  onUpdate: (next: PublicChargePayload) => void;
}) {
  const code = payload.charge.code;
  const kitRef = useRef<OnrampKit | null>(null);
  const moduleRef = useRef<OnrampModule | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<OnrampSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inline, setInline] = useState(false);
  const [settled, setSettled] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const onramp = moduleRef.current ?? (await import("@circle-fin/onramp-kit"));
      moduleRef.current = onramp;
      kitRef.current ??= onramp.createOnrampKit();
      const { session: raw } = await createChargeOnrampSession(code);
      setSession(onramp.parseOnrampSession(raw));
    } catch (cause) {
      setSession(null);
      setError(cause instanceof Error ? cause.message : "Couldn't start the card payment.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const onDepositSettled = useCallback(
    ({ payload: event }: { payload?: { amount?: unknown; tokenSymbol?: unknown } }) => {
      setSettled(true);
      void reportChargeSettled(code, {
        amount: event?.amount != null ? String(event.amount) : undefined,
        tokenSymbol: event?.tokenSymbol != null ? String(event.tokenSymbol) : undefined,
      })
        .then(onUpdate)
        .catch(() => undefined);
    },
    [code, onUpdate],
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

  function open() {
    const kit = kitRef.current;
    if (!kit || !session) return;
    setError(null);
    // Synchronous on the tap, or the browser blocks the popup.
    const result = kit.openWindow({ onDepositSettled, session });
    if (result.status === "blocked") {
      if (result.reason === "popup_blocked") {
        setError("Your browser blocked the window. Allow pop-ups for SaphraONE and tap again.");
      } else {
        setInline(true);
      }
      return;
    }
    // Each session is for one launch: have a fresh one ready for the next tap.
    void loadSession();
  }

  const amountLabel = formatMoney(total, payload.charge.currency);

  if (settled) {
    return (
      <div className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Your payment is on its way to {payload.business.name}. Card payments usually arrive in a
          minute or two; bank transfers can take longer. This page updates when it lands, and you
          can close it: the business will still receive it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
        In Circle&rsquo;s window, buy exactly <span className="font-semibold">{amountLabel}</span>{" "}
        USDC. It goes straight to {payload.business.name}.
      </p>
      {inline ? (
        <div className="h-[680px] overflow-hidden rounded-lg border border-border" ref={containerRef} />
      ) : (
        <Button className="h-12 w-full text-base" disabled={!session || loading} onClick={open} type="button">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          Pay {amountLabel} by card or bank
        </Button>
      )}
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        Circle handles the card or bank payment and a one-time identity check. Available in the US
        and supported European countries.
      </p>
    </div>
  );
}
