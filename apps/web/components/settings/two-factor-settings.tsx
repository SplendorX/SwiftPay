"use client";

import { Check, Copy, Download, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { CodeInput } from "@/components/two-factor/code-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  downloadBackupCodes,
  fetchTwoFactorStatus,
  postTwoFactor,
  twoFactorErrorMessage,
  type TwoFactorStatus,
} from "@/lib/two-factor/client";

type Flow =
  | { kind: "idle" }
  | { kind: "scan"; otpauthUri: string; secret: string }
  | { kind: "confirm"; otpauthUri: string; secret: string }
  | { kind: "codes"; codes: string[] }
  | { kind: "regenerate" }
  | { kind: "disable" };

/**
 * Settings → Two-factor authentication: an authenticator-app code on every
 * new sign-in, with single-use backup codes for a lost phone.
 */
export function TwoFactorSettings() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "codes" | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchTwoFactorStatus());
    } catch {
      setError("Two-factor authentication couldn't be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function go(next: Flow) {
    setFlow(next);
    setCode("");
    setBackupCode("");
    setError(null);
    setNotice(null);
  }

  async function copy(text: string, what: "key" | "codes") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {}
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const result = await postTwoFactor<{ otpauthUri: string; secret: string }>("setup-start");
      go({ kind: "scan", otpauthUri: result.otpauthUri, secret: result.secret });
    } catch (cause) {
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await postTwoFactor<{ backupCodes: string[] }>("setup-confirm", { code: value });
      setSavedCodes(false);
      go({ kind: "codes", codes: result.backupCodes });
      await load();
    } catch (cause) {
      setCode("");
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(value: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await postTwoFactor<{ backupCodes: string[] }>("regenerate-backup-codes", {
        code: value,
      });
      setSavedCodes(false);
      go({ kind: "codes", codes: result.backupCodes });
      await load();
    } catch (cause) {
      setCode("");
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function disable(input: { code?: string; backupCode?: string }) {
    setBusy(true);
    setError(null);
    try {
      await postTwoFactor("disable", input);
      go({ kind: "idle" });
      setNotice("Two-factor authentication is off.");
      await load();
    } catch (cause) {
      setCode("");
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {error ?? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </>
        )}
      </div>
    );
  }

  if (!status.signedIn) {
    return <p className="text-sm text-muted-foreground">Sign in to set up two-factor authentication.</p>;
  }

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        After you sign in on a new device, SwiftPay also asks for a code from an authenticator app
        such as Google Authenticator, Microsoft Authenticator, Authy or 1Password. Someone who gets
        into your Google account, email or wallet still can't open your SwiftPay account.
      </p>

      {flow.kind === "scan" ? (
        <div className="grid gap-4 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold">1. Scan this with your authenticator app</p>
          <div className="w-fit rounded-xl bg-white p-3">
            <LazyQRCodeSVG size={196} value={flow.otpauthUri} />
          </div>
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">Can't scan? Enter this key instead:</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm tracking-wider">
                {flow.secret}
              </code>
              <Button
                onClick={() => void copy(flow.secret.replace(/\s/g, ""), "key")}
                size="sm"
                type="button"
                variant="ghost"
              >
                {copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "key" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => go({ ...flow, kind: "confirm" })} type="button">
              Next
            </Button>
            <Button onClick={() => go({ kind: "idle" })} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : flow.kind === "confirm" ? (
        <div className="grid gap-4 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold">2. Enter the 6-digit code the app shows</p>
          <CodeInput autoFocus disabled={busy} onChange={setCode} onComplete={(value) => void confirm(value)} value={code} />
          <div className="flex gap-2">
            <Button onClick={() => go({ ...flow, kind: "scan" })} type="button" variant="outline">
              Back
            </Button>
            <Button onClick={() => go({ kind: "idle" })} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : flow.kind === "codes" ? (
        <div className="grid gap-4 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold">Save your backup codes</p>
          <p className="text-sm text-muted-foreground">
            If you lose your phone, each of these gets you in once. They won't be shown again.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-4 font-mono text-sm">
            {flow.codes.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copy(flow.codes.join("\n"), "codes")} type="button" variant="outline">
              {copied === "codes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === "codes" ? "Copied" : "Copy"}
            </Button>
            <Button onClick={() => downloadBackupCodes(flow.codes)} type="button" variant="outline">
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={savedCodes}
              className="h-4 w-4 accent-[var(--primary)]"
              onChange={(event) => setSavedCodes(event.target.checked)}
              type="checkbox"
            />
            I've saved these codes somewhere safe
          </label>
          <Button
            className="w-fit"
            disabled={!savedCodes}
            onClick={() => {
              go({ kind: "idle" });
              setNotice("Two-factor authentication is on.");
            }}
            type="button"
          >
            Done
          </Button>
        </div>
      ) : flow.kind === "regenerate" ? (
        <div className="grid gap-4 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold">Enter a code from your authenticator app</p>
          <p className="text-sm text-muted-foreground">Your old backup codes will stop working.</p>
          <CodeInput autoFocus disabled={busy} onChange={setCode} onComplete={(value) => void regenerate(value)} value={code} />
          <Button className="w-fit" onClick={() => go({ kind: "idle" })} type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      ) : flow.kind === "disable" ? (
        <div className="grid gap-4 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold">Enter a code to turn two-factor authentication off</p>
          <CodeInput autoFocus disabled={busy} onChange={setCode} onComplete={(value) => void disable({ code: value })} value={code} />
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (backupCode.trim()) void disable({ backupCode });
            }}
          >
            <Input
              aria-label="Backup code"
              autoCapitalize="none"
              className="h-10 w-44 font-mono"
              onChange={(event) => setBackupCode(event.target.value)}
              placeholder="or a backup code"
              value={backupCode}
            />
            <Button disabled={busy || !backupCode.trim()} type="submit" variant="outline">
              Use backup code
            </Button>
          </form>
          <Button className="w-fit" onClick={() => go({ kind: "idle" })} type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      ) : status.enabled ? (
        <div className="grid gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            On · {status.backupCodesLeft ?? 0} backup code{status.backupCodesLeft === 1 ? "" : "s"} left
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => go({ kind: "regenerate" })} type="button" variant="outline">
              New backup codes
            </Button>
            <Button disabled={busy} onClick={() => go({ kind: "disable" })} type="button" variant="ghost">
              Turn off
            </Button>
          </div>
        </div>
      ) : !status.available ? (
        <p className="text-sm text-muted-foreground">Two-factor authentication isn't available yet.</p>
      ) : (
        <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void start()} type="button">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Turn on two-factor authentication
        </Button>
      )}

      {busy && flow.kind !== "idle" ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-foreground">{notice}</p> : null}
    </div>
  );
}
