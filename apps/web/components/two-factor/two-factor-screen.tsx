"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useDisconnect } from "wagmi";

import { CodeInput } from "@/components/two-factor/code-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOutForAppLock } from "@/lib/app-lock/client";
import { postTwoFactor, twoFactorErrorMessage } from "@/lib/two-factor/client";

/** Full-screen step after signing in: the authenticator or a backup code. */
export function TwoFactorScreen({ onVerified }: { onVerified: () => void }) {
  const { disconnect } = useDisconnect();
  const [mode, setMode] = useState<"code" | "backup">("code");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function verify(input: { code?: string; backupCode?: string }) {
    setBusy(true);
    setError(null);
    try {
      const result = await postTwoFactor<{ backupCodesLeft?: number; usedBackupCode?: boolean }>(
        "verify",
        input,
      );
      if (result.usedBackupCode) {
        setNotice(
          `Backup code used. ${result.backupCodesLeft ?? 0} left — make new ones in Settings → Two-factor authentication.`,
        );
        window.setTimeout(onVerified, 2500);
        return;
      }
      onVerified();
    } catch (cause) {
      setCode("");
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[2147482000] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-background px-4 py-10 text-center"
      role="dialog"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="h-7 w-7" />
      </span>
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold text-foreground">Two-factor authentication</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {mode === "code"
            ? "Enter the 6-digit code from your authenticator app."
            : "Enter one of the backup codes you saved when you turned this on."}
        </p>
      </div>

      {mode === "code" ? (
        <CodeInput
          autoFocus
          disabled={busy || Boolean(notice)}
          onChange={setCode}
          onComplete={(value) => void verify({ code: value })}
          value={code}
        />
      ) : (
        <form
          className="grid justify-items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (backupCode.trim()) void verify({ backupCode });
          }}
        >
          <Input
            aria-label="Backup code"
            autoCapitalize="none"
            autoComplete="off"
            autoFocus
            className="h-12 w-56 text-center font-mono text-lg"
            disabled={busy || Boolean(notice)}
            onChange={(event) => setBackupCode(event.target.value)}
            placeholder="xxxxx-xxxxx"
            value={backupCode}
          />
          <Button disabled={busy || !backupCode.trim()} type="submit">
            Continue
          </Button>
        </form>
      )}

      <div className="grid min-h-6 justify-items-center gap-3">
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        {error ? <p className="max-w-xs text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="max-w-xs text-sm text-foreground">{notice}</p> : null}
        <button
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "code" ? "backup" : "code");
            setError(null);
          }}
          type="button"
        >
          {mode === "code" ? "Use a backup code" : "Use my authenticator app"}
        </button>
        <button
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => void signOutForAppLock(disconnect)}
          type="button"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
