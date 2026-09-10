"use client";

import { Briefcase, Check, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { PlatformBrand } from "@/components/brand/platform-brand";
import { useBusinessActor } from "@/components/business/use-business-actor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeAccountOnboardingClient, fetchAccountState } from "@/lib/account/client";
import {
  APP_LOCALES,
  applyAppLocale,
  localeStorageKey,
  onboardingCopy,
  type AppLocale,
} from "@/lib/locales";
import { profileImageAccept, resizeProfileImageFile } from "@/lib/profile-image";
import { ensureProfile, validateUsername } from "@/lib/profile";
import { cn } from "@/lib/utils";

type Step = "language" | "account" | "personal" | "business";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function OnboardingFlow() {
  const router = useRouter();
  const { circleSocialUuid, ownerWallet } = useBusinessActor();
  const [step, setStep] = useState<Step>("language");
  const [locale, setLocale] = useState<AppLocale>("en");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const copy = onboardingCopy(locale);

  useEffect(() => {
    const stored = localStorage.getItem(localeStorageKey);
    if (stored && APP_LOCALES.some((item) => item.id === stored)) {
      setLocale(stored as AppLocale);
    }
  }, []);

  useEffect(() => {
    applyAppLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!ownerWallet) return;
    let cancelled = false;

    async function boot() {
      try {
        await ensureProfile({
          authProvider: circleSocialUuid ? "google" : "external",
          circleSocialUuid,
          walletAddress: ownerWallet!,
        });
        const state = await fetchAccountState(ownerWallet!, circleSocialUuid);
        if (cancelled) return;
        if (state.account.account_type_selected) {
          router.replace(
            state.account.account_type === "BUSINESS" ? "/business" : "/dashboard",
          );
          return;
        }
        setUsername(state.account.username);
        setBio(state.account.bio ?? "");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [circleSocialUuid, ownerWallet, router]);

  const usernameError = useMemo(
    () => (username.trim() ? validateUsername(username) : "Enter a username."),
    [username],
  );

  async function finish(accountKind: "personal" | "business") {
    if (!ownerWallet) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeAccountOnboardingClient(
        ownerWallet,
        {
          accountKind,
          bio,
          businessCategory: category,
          businessDescription: description,
          businessName,
          locale,
          logoUrl: logoUrl || null,
          username,
          website,
        },
        circleSocialUuid,
      );
      router.replace(
        result.account.account_type === "BUSINESS" ? "/business" : "/dashboard",
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setLogoBusy(true);
    setError(null);
    try {
      setLogoUrl(await resizeProfileImageFile(file));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  }

  if (!ownerWallet) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="flex justify-center">
          <PlatformBrand />
        </div>
        <h1 className="mt-4 font-heading text-3xl">Connect to continue</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in to set up your account, language, and payment identity.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center text-sm text-muted-foreground">
        Preparing your account…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <p className="eyebrow">{copy.languageEyebrow}</p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {step === "language" ? (
        <section>
          <h1 className="mt-3 font-heading text-3xl sm:text-4xl">{copy.languageTitle}</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">{copy.languageSubtitle}</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {APP_LOCALES.map((item) => {
              const selected = item.id === locale;
              return (
                <button
                  className={cn(
                    "flex min-h-24 flex-col items-start justify-between rounded-2xl border px-4 py-3 text-left transition",
                    selected
                      ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                      : "border-border bg-card hover:border-primary/30",
                  )}
                  key={item.id}
                  onClick={() => setLocale(item.id)}
                  type="button"
                >
                  <span className="text-sm font-semibold">{item.native}</span>
                  <span className="text-xs text-muted-foreground">{item.english}</span>
                  {selected ? <Check className="mt-2 h-4 w-4 text-primary" /> : <span />}
                </button>
              );
            })}
          </div>
          <Button className="mt-8 h-11 px-6" onClick={() => setStep("account")}>
            {copy.continue}
          </Button>
        </section>
      ) : null}

      {step === "account" ? (
        <section>
          <h1 className="mt-2 font-heading text-3xl">How will you use SwiftPay?</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Choose Personal or Business first. Profile fields after this match the account you pick.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button
              className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary/40"
              onClick={() => setStep("personal")}
              type="button"
            >
              <UserRound className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-heading text-xl">Personal</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Everyday payments, sending money, saving, earning, and managing personal finances.
              </p>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                <li>Send & receive</li>
                <li>Pay requests</li>
                <li>Save, Earn, Swap</li>
                <li>BatchPay, RecurePay, Circle</li>
              </ul>
              <p className="mt-5 text-sm font-medium text-primary">Continue with Personal</p>
            </button>
            <button
              className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary/40"
              onClick={() => setStep("business")}
              type="button"
            >
              <Briefcase className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-heading text-xl">Business</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                A professional SwiftPay workspace for businesses, freelancers, and organizations.
              </p>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                <li>Professional business profile</li>
                <li>Professional Overview</li>
                <li>Invoices</li>
                <li>Everything in Personal, same wallet</li>
              </ul>
              <p className="mt-5 text-sm font-medium text-primary">Continue with Business</p>
            </button>
          </div>
          <Button className="mt-6" onClick={() => setStep("language")} variant="ghost">
            Back
          </Button>
        </section>
      ) : null}

      {step === "personal" ? (
        <section className="max-w-lg">
          <h1 className="mt-2 font-heading text-3xl">{copy.profileTitle}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This username is how others send, request, and find you on SwiftPay.
          </p>
          <label className="mt-8 block text-sm font-medium">
            {copy.username}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="yourname"
              value={username}
            />
          </label>
          {usernameError ? (
            <p className="mt-2 text-xs text-muted-foreground">{usernameError}</p>
          ) : null}
          <label className="mt-5 block text-sm font-medium">
            {copy.bio}
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              maxLength={160}
              onChange={(event) => setBio(event.target.value.slice(0, 160))}
              placeholder="Optional. 160 characters."
              value={bio}
            />
          </label>
          <div className="mt-8 flex gap-3">
            <Button onClick={() => setStep("account")} variant="outline">
              Back
            </Button>
            <Button
              disabled={busy || Boolean(usernameError)}
              onClick={() => void finish("personal")}
            >
              Continue with Personal
            </Button>
          </div>
        </section>
      ) : null}

      {step === "business" ? (
        <section className="max-w-lg">
          <h1 className="font-heading text-3xl">Create your business profile</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Set the public identity customers see on invoices. You can edit this later in Settings.
          </p>
          <label className="mt-8 block text-sm font-medium">
            Username
            <Input
              className="mt-2 h-11"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="acme"
              value={username}
            />
          </label>
          {usernameError ? (
            <p className="mt-2 text-xs text-muted-foreground">{usernameError}</p>
          ) : null}
          <label className="mt-5 block text-sm font-medium">
            Business name
            <Input
              className="mt-2 h-11"
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Acme Studio"
              value={businessName}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            Category
            <Input
              className="mt-2 h-11"
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Design studio"
              value={category}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            Description
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              maxLength={280}
              onChange={(event) => setDescription(event.target.value.slice(0, 280))}
              placeholder="What the business does"
              value={description}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            Website
            <Input
              className="mt-2 h-11"
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://"
              value={website}
            />
          </label>
          <div className="mt-5">
            <p className="text-sm font-medium">Logo</p>
            <div className="mt-2 flex items-center gap-3">
              {logoUrl ? (
                <img alt="" className="h-14 w-14 rounded-2xl object-cover" src={logoUrl} />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed text-xs text-muted-foreground">
                  Logo
                </div>
              )}
              <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border px-3 text-sm font-medium">
                {logoBusy ? "Processing…" : logoUrl ? "Change logo" : "Upload logo"}
                <input
                  accept={profileImageAccept}
                  className="sr-only"
                  disabled={logoBusy}
                  onChange={(event) => void handleLogo(event)}
                  type="file"
                />
              </label>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <Button onClick={() => setStep("account")} variant="outline">
              Back
            </Button>
            <Button
              disabled={busy || Boolean(usernameError) || !businessName.trim()}
              onClick={() => void finish("business")}
            >
              Create Business profile
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
