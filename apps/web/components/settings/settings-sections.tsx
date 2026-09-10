"use client";

import { Bell, Building2, Languages, MonitorSmartphone, Palette, Wallet } from "lucide-react";

import { useOptionalAccount } from "@/components/account/account-provider";
import { AccountTypeSettings } from "@/components/settings/account-type-settings";

import { AlertsSettings } from "@/components/settings/alerts-settings";
import { LanguageSettings } from "@/components/settings/language-settings";
import { LightSurfacePicker } from "@/components/settings/light-surface-picker";
import { AccountProfileSettings } from "@/components/settings/account-profile-settings";
import { SessionDeviceManagement } from "@/components/settings/session-device-management";
import { SettingsCollapsibleCard } from "@/components/settings/settings-collapsible-card";
import { ThemeToggle } from "@/components/theme-toggle";

export function SettingsSections() {
  const isBusiness = useOptionalAccount()?.isBusiness ?? false;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SettingsCollapsibleCard
        body="Dark, light, or system. Light mode can switch between cashmere and liquid glass."
        icon={Palette}
        sectionId="appearance"
        title="Appearance"
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">Theme</p>
            <ThemeToggle />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Light surface</p>
            <LightSurfacePicker />
          </div>
        </div>
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body="Choose the language used for onboarding and account copy. This is stored on your device and profile."
        icon={Languages}
        sectionId="language"
        title="Language"
      >
        <LanguageSettings />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body="Personal accounts can upgrade to Business. The same wallet and activity stay in place. Business cannot be reversed."
        icon={Building2}
        sectionId="account-type"
        title="Account"
      >
        <AccountTypeSettings />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body={
          isBusiness
            ? "Edit your business name, description, logo, and public business details."
            : "Edit your username, bio, and photo."
        }
        icon={Wallet}
        sectionId="wallet-profile"
        title="Profile"
      >
        <AccountProfileSettings />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body="Review active sessions in this browser, manage wallet sign-in, and sign out from shared devices."
        icon={MonitorSmartphone}
        sectionId="sessions-devices"
        title="Sessions & devices"
      >
        <SessionDeviceManagement embedded />
      </SettingsCollapsibleCard>

      <SettingsCollapsibleCard
        body="Toast rules, quiet hours, and clearing read notification messages."
        icon={Bell}
        sectionId="alerts"
        title="Alerts"
      >
        <AlertsSettings />
      </SettingsCollapsibleCard>
    </div>
  );
}
