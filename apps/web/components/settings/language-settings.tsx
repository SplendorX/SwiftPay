"use client";

import { useEffect, useState } from "react";

import { useBusinessActor } from "@/components/business/use-business-actor";
import { cn } from "@/lib/utils";
import {
  APP_LOCALES,
  applyAppLocale,
  readStoredLocale,
  type AppLocale,
} from "@/lib/locales";

export function LanguageSettings() {
  const { circleSocialUuid, ownerWallet } = useBusinessActor();
  const [locale, setLocale] = useState<AppLocale>("en");

  useEffect(() => {
    const next = readStoredLocale();
    setLocale(next);
    applyAppLocale(next);
  }, []);

  async function selectLocale(next: AppLocale) {
    setLocale(next);
    applyAppLocale(next);
    if (!ownerWallet) return;
    try {
      await fetch("/api/profile", {
        body: JSON.stringify({
          circleSocialUuid,
          locale: next,
          walletAddress: ownerWallet,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
    } catch {
      // Locale still applies locally if the profile save fails.
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {APP_LOCALES.map((option) => {
        const active = locale === option.id;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-left transition",
              active
                ? "border-primary bg-primary/10 shadow-sm"
                : "border-border bg-background hover:border-primary/30",
            )}
            key={option.id}
            onClick={() => void selectLocale(option.id)}
            type="button"
          >
            <span className="block text-sm font-semibold text-foreground">
              {option.native}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {option.english}
            </span>
          </button>
        );
      })}
    </div>
  );
}
