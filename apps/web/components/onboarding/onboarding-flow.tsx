"use client";

import { Briefcase, Check, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { PlatformBrand } from "@/components/brand/platform-brand";
import { useBusinessActor } from "@/components/business/use-business-actor";
import { useOptionalAccount } from "@/components/account/account-provider";
import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/components/locale-provider";
import { completeAccountOnboardingClient, fetchAccountState } from "@/lib/account/client";
import { APP_LOCALES } from "@/lib/locales";
import { profileImageAccept, resizeProfileImageFile } from "@/lib/profile-image";
import { ensureProfile, notifyProfileUpdated, validateUsername } from "@/lib/profile";
import { walletSessionChangedEventName } from "@/lib/wallet-auth-client";
import { cn } from "@/lib/utils";

type Step = "language" | "account" | "personal" | "business";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function OnboardingFlow() {
  const router = useRouter();
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { circleSocialUuid, ownerWallet } = useBusinessActor();
  const accountContext = useOptionalAccount();
  const workspaceContext = useOptionalWorkspace();
  const [step, setStep] = useState<Step>("language");
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
          notifyProfileUpdated({
            avatar_url: state.account.avatar_url,
            bio: state.account.bio,
            display_name: state.account.display_name,
            username: state.account.username,
            wallet_address: ownerWallet!,
          });
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(walletSessionChangedEventName, {
                detail: { ownerWallet },
              }),
            );
          }
          await Promise.allSettled([
            accountContext?.refresh?.(),
            workspaceContext?.refresh?.(),
          ]);
          router.replace(
            state.account.account_type === "BUSINESS" ? "/business" : "/dashboard",
          );
          return;
        }
        setUsername(state.account.username);
        setBio(state.account.bio ?? "");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, t("common.somethingWentWrong")));
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [accountContext, circleSocialUuid, ownerWallet, router, t, workspaceContext]);

  const usernameError = useMemo(
    () => (username.trim() ? validateUsername(username) : t("onboarding.enterUsername")),
    [t, username],
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

      notifyProfileUpdated({
        avatar_url: result.account.avatar_url,
        bio: result.account.bio,
        display_name: result.account.display_name,
        username: result.account.username,
        wallet_address: ownerWallet,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(walletSessionChangedEventName, {
            detail: { ownerWallet },
          }),
        );
      }

      await Promise.allSettled([
        accountContext?.refresh?.(),
        workspaceContext?.refresh?.(),
      ]);

      const destination =
        result.account.account_type === "BUSINESS" ? "/business" : "/dashboard";
      router.replace(destination);
    } catch (err) {
      setError(errorMessage(err, t("common.somethingWentWrong")));
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
      setError(errorMessage(err, t("common.somethingWentWrong")));
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
        <h1 className="mt-4 font-heading text-3xl">{t("onboarding.connectToContinue")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("onboarding.connectToContinueBody")}
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center text-sm text-muted-foreground">
        {t("onboarding.preparingAccount")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <p className="eyebrow">{t("onboarding.languageEyebrow")}</p>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {step === "language" ? (
        <section>
          <h1 className="mt-3 font-heading text-3xl sm:text-4xl">{t("onboarding.languageTitle")}</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">{t("onboarding.languageSubtitle")}</p>
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
            {t("onboarding.continue")}
          </Button>
        </section>
      ) : null}

      {step === "account" ? (
        <section>
          <h1 className="mt-2 font-heading text-3xl">{t("onboarding.howWillYouUse")}</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            {t("onboarding.howWillYouUseBody")}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <button
              className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary/40"
              onClick={() => setStep("personal")}
              type="button"
            >
              <UserRound className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-heading text-xl">{t("onboarding.personalTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("onboarding.personalDescription")}
              </p>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                <li>{t("onboarding.personalBullet1")}</li>
                <li>{t("onboarding.personalBullet2")}</li>
                <li>{t("onboarding.personalBullet3")}</li>
                <li>{t("onboarding.personalBullet4")}</li>
              </ul>
              <p className="mt-5 text-sm font-medium text-primary">{t("onboarding.continuePersonal")}</p>
            </button>
            <button
              className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary/40"
              onClick={() => setStep("business")}
              type="button"
            >
              <Briefcase className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-heading text-xl">{t("onboarding.businessCardTitle")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("onboarding.businessCardDescription")}
              </p>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                <li>{t("onboarding.businessBullet1")}</li>
                <li>{t("onboarding.businessBullet2")}</li>
                <li>{t("onboarding.businessBullet3")}</li>
                <li>{t("onboarding.businessBullet4")}</li>
              </ul>
              <p className="mt-5 text-sm font-medium text-primary">{t("onboarding.continueBusiness")}</p>
            </button>
          </div>
          <Button className="mt-6" onClick={() => setStep("language")} variant="ghost">
            {t("common.back")}
          </Button>
        </section>
      ) : null}

      {step === "personal" ? (
        <section className="max-w-lg">
          <h1 className="mt-2 font-heading text-3xl">{t("onboarding.profileTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("onboarding.profileSubtitle")}
          </p>
          <label className="mt-8 block text-sm font-medium">
            {t("onboarding.username")}
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
            {t("onboarding.bio")}
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              maxLength={160}
              onChange={(event) => setBio(event.target.value.slice(0, 160))}
              placeholder={t("onboarding.bioHint")}
              value={bio}
            />
          </label>
          <div className="mt-8 flex gap-3">
            <Button onClick={() => setStep("account")} variant="outline">
              {t("common.back")}
            </Button>
            <Button
              disabled={busy || Boolean(usernameError)}
              onClick={() => void finish("personal")}
            >
              {t("onboarding.continuePersonal")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "business" ? (
        <section className="max-w-lg">
          <h1 className="font-heading text-3xl">{t("onboarding.createBusinessProfile")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("onboarding.createBusinessProfileBody")}
          </p>
          <label className="mt-8 block text-sm font-medium">
            {t("common.username")}
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
            {t("common.businessName")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="Acme Studio"
              value={businessName}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            {t("common.category")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Design studio"
              value={category}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            {t("common.description")}
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              maxLength={280}
              onChange={(event) => setDescription(event.target.value.slice(0, 280))}
              placeholder="What the business does"
              value={description}
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            {t("common.website")}
            <Input
              className="mt-2 h-11"
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://"
              value={website}
            />
          </label>
          <div className="mt-5">
            <p className="text-sm font-medium">{t("common.logo")}</p>
            <div className="mt-2 flex items-center gap-3">
              {logoUrl ? (
                <img alt="" className="h-14 w-14 rounded-2xl object-cover" src={logoUrl} />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed text-xs text-muted-foreground">
                  {t("common.logo")}
                </div>
              )}
              <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border px-3 text-sm font-medium">
                {logoBusy
                  ? t("common.processing")
                  : logoUrl
                    ? t("common.changeLogo")
                    : t("common.uploadLogo")}
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
              {t("common.back")}
            </Button>
            <Button
              disabled={busy || Boolean(usernameError) || !businessName.trim()}
              onClick={() => void finish("business")}
            >
              {t("onboarding.createBusinessCta")}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
