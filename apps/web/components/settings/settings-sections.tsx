"use client";

import { Bell, Building2, Languages, MonitorSmartphone, Palette, Wallet } from "lucide-react";

import { useOptionalAccount } from "@/components/account/account-provider";
import { useT } from "@/components/locale-provider";
import { AccountTypeSettings } from "@/components/settings/account-type-settings";

import { AlertsSettings } from "@/components/settings/alerts-settings";
import { LanguageSettings } from "@/components/settings/language-settings";
import { LightSurfacePicker } from "@/components/settings/light-surface-picker";
import { AccountProfileSettings } from "@/components/settings/account-profile-settings";
import { SessionDeviceManagement } from "@/components/settings/session-device-management";
import { SettingsCollapsibleCard } from "@/components/settings/settings-collapsible-card";
import { ThemeToggle } from "@/components/theme-toggle";

export function SettingsPageIntro() {
  const t = useT();

  return (
    <div>
      <p className="section-eyebrow">{t("settings.preferencesEyebrow")}</p>
      <h2 className="section-title">{t("settings.preferencesTitle")}</h2>
      <p className="section-copy">{t("settings.preferencesCopy")}</p>
    </div>
  );
}

export function SettingsSections() {
  const isBusiness = useOptionalAccount()?.isBusiness ?? false;
  const t = useT();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SettingsCollapsibleCard
        body={t("settings.accountBody")}
        icon={Building2}
        sectionId="account-type"
        title={t("settings.accountTitle")}
      >
        <AccountTypeSettings />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body={
          isBusiness
            ? t("settings.profileBodyBusiness")
            : t("settings.profileBody")
        }
        icon={Wallet}
        sectionId="wallet-profile"
        title={t("settings.profileTitle")}
      >
        <AccountProfileSettings />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body={t("settings.appearanceBody")}
        icon={Palette}
        sectionId="appearance"
        title={t("settings.appearanceTitle")}
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{t("settings.theme")}</p>
            <ThemeToggle />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t("settings.lightSurface")}</p>
            <LightSurfacePicker />
          </div>
        </div>
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body={t("settings.languageBody")}
        icon={Languages}
        sectionId="language"
        title={t("settings.languageTitle")}
      >
        <LanguageSettings />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body={t("settings.sessionsBody")}
        icon={MonitorSmartphone}
        sectionId="sessions-devices"
        title={t("settings.sessionsTitle")}
      >
        <SessionDeviceManagement embedded />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body={t("settings.alertsBody")}
        icon={Bell}
        sectionId="alerts"
        title={t("settings.alertsTitle")}
      >
        <AlertsSettings />
      </SettingsCollapsibleCard>
    </div>
  );
}
