"use client";

import { BadgeCheck, Clock, Loader2, Lock, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchBusinessVerification,
  submitBusinessVerification,
  type BusinessVerificationState,
} from "@/lib/account/client";
import { cn } from "@/lib/utils";

/** "GB09446231" → "GB0944••••": enough to recognise, not to reuse. */
function maskId(value: string) {
  return value.length <= 6 ? value : `${value.slice(0, value.length - 4)}••••`;
}

/**
 * Business verification: unlocked by a complete profile, then a registration
 * number or tax ID checked against an official register where a free one
 * exists, or by the SwiftPay team where it doesn't.
 */
export function BusinessVerificationPanel({
  circleSocialUuid,
  ownerWallet,
  refreshKey,
}: {
  circleSocialUuid?: string;
  ownerWallet: string;
  /** Changes when the profile is saved, so eligibility re-checks. */
  refreshKey?: string;
}) {
  const [state, setState] = useState<BusinessVerificationState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchBusinessVerification(ownerWallet, circleSocialUuid);
      setState(next);
      setIdType((current) =>
        next.options.some((option) => option.type === current) ? current : (next.options[0]?.type ?? ""),
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Verification status couldn't be loaded.");
    }
  }, [circleSocialUuid, ownerWallet]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const next = await submitBusinessVerification(ownerWallet, { idNumber, idType }, circleSocialUuid);
      setState(next);
      if (next.submission?.status !== "REJECTED") setIdNumber("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your submission couldn't be sent.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <section className="space-y-4 rounded-2xl border border-border p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h3 className="font-heading text-base font-semibold">Business verification</h3>
      </div>
      {children}
    </section>
  );

  if (loadError) return shell(<p className="text-sm text-destructive">{loadError}</p>);
  if (!state) {
    return shell(
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking verification status…
      </p>,
    );
  }

  if (!state.ready) {
    return shell(
      <p className="text-sm text-muted-foreground">
        Verification isn&rsquo;t switched on yet. An administrator needs to run the
        business-verification-reviews.sql migration.
      </p>,
    );
  }

  if (!state.eligible) {
    return shell(
      <div className="flex gap-3 rounded-xl bg-muted/40 p-3 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Complete your profile to unlock verification</p>
          <p className="mt-1 text-muted-foreground">
            {state.missing.length > 0
              ? `Still needed: ${state.missing.join(", ")}.`
              : "Choose the country your business is registered in."}
          </p>
        </div>
      </div>,
    );
  }

  const submission = state.submission;

  if (state.review === "APPROVED" && submission?.status === "APPROVED") {
    return shell(
      <div className="flex gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="font-semibold">
            {state.status === "VERIFIED" ? "Your business is verified" : "Review approved"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {submission.method === "AUTOMATIC" && submission.source
              ? `Confirmed with ${submission.source}`
              : "Confirmed by the SwiftPay team"}
            {submission.registryName ? ` as “${submission.registryName}”` : ""} · {maskId(submission.idNumber)}
          </p>
          {state.status !== "VERIFIED" ? (
            <p className="mt-1 text-muted-foreground">
              Fill in the missing profile fields to show the verified badge again.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Changing your business name or country means verifying again.
            </p>
          )}
        </div>
      </div>,
    );
  }

  if (submission?.status === "PENDING") {
    return shell(
      <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold">Under review</p>
          <p className="mt-1 text-muted-foreground">
            {submission.idType === "VAT" ? "VAT number" : submission.idType === "LEI" ? "LEI" : "ID"}{" "}
            {maskId(submission.idNumber)} is with the SwiftPay team. Most reviews finish within two
            business days.
          </p>
          {submission.note ? <p className="mt-1 text-xs text-muted-foreground">{submission.note}</p> : null}
        </div>
      </div>,
    );
  }

  const option = state.options.find((candidate) => candidate.type === idType) ?? state.options[0];

  return shell(
    <>
      <p className="text-sm text-muted-foreground">
        Add your registration number or tax ID for {state.country?.name}. Verified businesses show a
        badge on their profile, invoices and payment pages.
      </p>

      {submission?.status === "REJECTED" && submission.reason ? (
        <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium">Last attempt wasn&rsquo;t approved.</span> {submission.reason}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {state.options.map((candidate) => (
          <button
            aria-pressed={idType === candidate.type}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left text-sm transition",
              idType === candidate.type
                ? "border-primary bg-primary/5"
                : "border-border hover:border-foreground/30",
            )}
            key={candidate.type}
            onClick={() => setIdType(candidate.type)}
            type="button"
          >
            <span className="block font-medium">{candidate.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {candidate.automatic ? `Checked instantly · ${candidate.source}` : "Reviewed by the SwiftPay team"}
            </span>
          </button>
        ))}
      </div>

      {option ? (
        <label className="block text-sm font-medium">
          {option.label}
          <Input
            autoComplete="off"
            className="mt-2 h-11 font-mono uppercase"
            onChange={(event) => setIdNumber(event.target.value)}
            placeholder={option.placeholder}
            value={idNumber}
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button disabled={busy || !idNumber.trim() || !option} onClick={() => void submit()} type="button">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {busy
          ? option?.automatic
            ? `Checking with ${option.source}…`
            : "Submitting…"
          : option?.automatic
            ? "Verify now"
            : "Submit for review"}
      </Button>
      <p className="text-xs text-muted-foreground">
        The number must belong to {state.country?.name ? `a business registered in ${state.country.name}` : "your business"}{" "}
        under the name on your profile. One number can verify one SwiftPay business.
      </p>
    </>,
  );
}
