"use client";

import { Fingerprint, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useDisconnect } from "wagmi";

import { PIN_LENGTH, PinPad } from "@/components/app-lock/pin-pad";
import {
  AppLockError,
  biometricLabel,
  postAppLock,
  signOutForAppLock,
} from "@/lib/app-lock/client";

function pausedMessage(until: string) {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Full-screen lock: PIN keypad, Face ID / fingerprint, or sign out. */
export function LockScreen({
  hasPasskey,
  onUnlocked,
  pausedUntil,
}: {
  hasPasskey: boolean;
  onUnlocked: () => void;
  pausedUntil?: string | null;
}) {
  const { disconnect } = useDisconnect();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    pausedUntil && Date.parse(pausedUntil) > Date.now() ? pausedMessage(pausedUntil) : null,
  );
  const [shake, setShake] = useState(false);
  const [biometricsReady, setBiometricsReady] = useState(false);

  useEffect(() => {
    if (!hasPasskey) return;
    void import("@simplewebauthn/browser").then(({ platformAuthenticatorIsAvailable }) =>
      platformAuthenticatorIsAvailable().then(setBiometricsReady, () => undefined),
    );
  }, [hasPasskey]);

  function fail(cause: unknown) {
    setPin("");
    setShake(true);
    window.setTimeout(() => setShake(false), 400);
    if (cause instanceof AppLockError) {
      if (cause.details.signedOut) {
        void signOutForAppLock(disconnect);
        return;
      }
      if (cause.details.pausedUntil) {
        setError(pausedMessage(cause.details.pausedUntil));
        return;
      }
      setError(
        cause.details.attemptsLeft != null
          ? `Wrong PIN. ${cause.details.attemptsLeft} ${cause.details.attemptsLeft === 1 ? "try" : "tries"} left before a pause.`
          : cause.message,
      );
      return;
    }
    setError("Couldn't unlock. Check your connection and try again.");
  }

  async function unlockWithPin(value: string) {
    if (value.length !== PIN_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      await postAppLock("unlock", { pin: value });
      onUnlocked();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithBiometrics() {
    setBusy(true);
    setError(null);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const { options } = await postAppLock<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>(
        "passkey-unlock-options",
      );
      const response = await startAuthentication({ optionsJSON: options });
      await postAppLock("passkey-unlock", { response });
      onUnlocked();
    } catch (cause) {
      // Cancelling the prompt isn't an error worth a message.
      if (cause instanceof Error && cause.name === "NotAllowedError") {
        setError(null);
      } else {
        fail(cause);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[2147482000] flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background px-4 py-10"
      role="dialog"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <img
          alt=""
          className="h-16 w-16 rounded-2xl"
          height={192}
          src="/icons/icon-192.png"
          width={192}
        />
        <h1 className="text-xl font-semibold text-foreground">SwiftPay is locked</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Enter your PIN{hasPasskey && biometricsReady ? ` or use ${biometricLabel()}` : ""} to
          continue.
        </p>
      </div>

      <PinPad
        disabled={busy}
        error={shake}
        onChange={(value) => {
          setPin(value);
          if (value) setError(null);
        }}
        onComplete={(value) => void unlockWithPin(value)}
        value={pin}
      />

      <div className="grid min-h-6 justify-items-center gap-4 text-center">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        {error ? <p className="max-w-xs text-sm text-destructive">{error}</p> : null}

        {hasPasskey && biometricsReady ? (
          <button
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
            disabled={busy}
            onClick={() => void unlockWithBiometrics()}
            type="button"
          >
            <Fingerprint className="h-4 w-4" />
            Use {biometricLabel()}
          </button>
        ) : null}

        <button
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => void signOutForAppLock(disconnect)}
          type="button"
        >
          Forgot PIN? Sign out
        </button>
      </div>
    </div>
  );
}
