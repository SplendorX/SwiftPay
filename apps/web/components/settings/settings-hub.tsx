"use client";

import { AgentWalletSettings } from "@/components/settings/agent-wallet-settings";
import { InstallAppSettingsCard } from "@/components/pwa/install-app";
import { SupportCenter } from "@/components/support/support-center";
import {
  Banknote,
  Bell,
  Bot,
  Building2,
  Headset,
  Languages,
  Lock,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { useOptionalAccount } from "@/components/account/account-provider";
import { useT } from "@/components/locale-provider";
import { AccountProfileSettings } from "@/components/settings/account-profile-settings";
import { AccountTypeSettings } from "@/components/settings/account-type-settings";
import { AlertsSettings } from "@/components/settings/alerts-settings";
import { AppLockSettings } from "@/components/settings/app-lock-settings";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { CurrencySettings } from "@/components/settings/currency-settings";
import { LanguageSettings } from "@/components/settings/language-settings";
import { LightSurfacePicker } from "@/components/settings/light-surface-picker";
import { SessionDeviceManagement } from "@/components/settings/session-device-management";
import { ThemeToggle } from "@/components/theme-toggle";
import { SectionHub, type HubSection } from "@/components/layout/section-hub";

/** Section ids double as URL hashes, so /settings#alerts links keep working. */
type SettingsSection = HubSection & { render: () => ReactNode };

const groupOrder = ["Account", "Preferences", "Security & ALLIE", "Notifications"];



/**
 * Settings as a list of sections beside the open one, like Deposit: cards on
 * the left, the chosen section on the right. On a phone the list and the
 * section take turns full-width, with a back button, like a phone's own
 * settings app.
 */
export function SettingsHub() {
  const t = useT();
  const accountContext = useOptionalAccount();
  const isBusiness = accountContext?.isBusiness ?? false;

  const sections = useMemo<SettingsSection[]>(
    () => [
      {
        id: "account-type",
        group: "Account",
        icon: Building2,
        title: t("settings.accountTitle"),
        blurb: t("settings.accountBody"),
        render: () => <AccountTypeSettings />,
      },
      {
        id: "wallet-profile",
        group: "Account",
        icon: Wallet,
        title: t("settings.profileTitle"),
        blurb: isBusiness ? t("settings.profileBodyBusiness") : t("settings.profileBody"),
        render: () => <AccountProfileSettings />,
      },
      {
        id: "appearance",
        group: "Preferences",
        icon: Palette,
        title: t("settings.appearanceTitle"),
        blurb: t("settings.appearanceBody"),
        render: () => (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold">{t("settings.theme")}</p>
              <ThemeToggle />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{t("settings.lightSurface")}</p>
              <LightSurfacePicker />
            </div>
          </div>
        ),
      },
      {
        id: "language",
        group: "Preferences",
        icon: Languages,
        title: t("settings.languageTitle"),
        blurb: t("settings.languageBody"),
        render: () => <LanguageSettings />,
      },
      {
        id: "display-currency",
        group: "Preferences",
        icon: Banknote,
        title: "Display currency",
        blurb: "Choose the currency your balances and portfolio total are shown in.",
        render: () => <CurrencySettings />,
      },
      {
        id: "install-app",
        group: "Preferences",
        icon: Smartphone,
        title: "Install the app",
        blurb: "Add SwiftPay to your home screen or desktop and open it like any other app.",
        render: () => <InstallAppSettingsCard />,
      },
      {
        id: "app-lock",
        group: "Security & ALLIE",
        icon: Lock,
        title: "App lock",
        blurb: "Ask for a PIN, Face ID or fingerprint whenever you come back to SwiftPay.",
        render: () => <AppLockSettings />,
      },
      {
        id: "two-factor",
        group: "Security & ALLIE",
        icon: ShieldCheck,
        title: "Two-factor authentication",
        blurb: "Ask for a code from an authenticator app whenever you sign in on a new device.",
        render: () => <TwoFactorSettings />,
      },
      {
        id: "sessions-devices",
        group: "Security & ALLIE",
        icon: MonitorSmartphone,
        title: t("settings.sessionsTitle"),
        blurb: t("settings.sessionsBody"),
        render: () => <SessionDeviceManagement embedded />,
      },
      {
        id: "agent-wallet",
        group: "Security & ALLIE",
        icon: Bot,
        title: "Agent Wallet & ALLIE",
        blurb:
          "Create, fund, and govern the Agent Wallet ALLIE spends from. She can only ever spend what you delegate, within the limits you set.",
        render: () => <AgentWalletSettings embedded />,
      },
      {
        id: "support",
        group: "Help",
        icon: Headset,
        title: "Help & Support",
        blurb: "Instant answers to common questions, and a direct line to the SwiftPay team.",
        render: () => (
          <div className="overflow-hidden rounded-2xl border border-border">
            <SupportCenter variant="page" />
          </div>
        ),
      },
      {
        id: "alerts",
        group: "Notifications",
        icon: Bell,
        title: t("settings.alertsTitle"),
        blurb: t("settings.alertsBody"),
        render: () => <AlertsSettings />,
      },
    ],
    [isBusiness, t],
  );

  return (
    <SectionHub
      ariaLabel="Settings sections"
      backLabel="All settings"
      groupOrder={groupOrder}
      sections={sections}
    />
  );
}
