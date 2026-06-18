"use client";

import {
  Bell,
  Database,
  MonitorSmartphone,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { ProfileUsernameSettings } from "@/components/settings/profile-username-settings";
import { SessionDeviceManagement } from "@/components/settings/session-device-management";
import { SettingsCollapsibleCard } from "@/components/settings/settings-collapsible-card";

const settingsSections = [
  {
    body: "Recent privacy codes and payroll folders are stored per active wallet profile.",
    icon: Database,
    title: "Wallet-scoped storage",
  },
  {
    body: "Set your public username and switch between Circle and external wallet sessions from the account menu.",
    collapsible: true,
    icon: Wallet,
    sectionId: "wallet-profile",
    title: "Wallet profile",
    walletProfile: true,
  },
  {
    body: "Review active sessions in this browser, manage wallet sign-in, and sign out from shared devices.",
    collapsible: true,
    icon: MonitorSmartphone,
    sectionId: "sessions-devices",
    sessionManagement: true,
    title: "Sessions & devices",
  },
  {
    body: "Transaction prompts stay visible before approval, funding, swap, and claim actions.",
    icon: ShieldCheck,
    title: "Confirmation safety",
  },
  {
    body: "Notification preferences will appear here as the product grows.",
    icon: Bell,
    title: "Alerts",
  },
] as const;

export function SettingsSections() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {settingsSections.map((section) => {
        const Icon = section.icon;
        const isCollapsible = "collapsible" in section && section.collapsible;
        const isWalletProfile =
          "walletProfile" in section && section.walletProfile;
        const isSessionManagement =
          "sessionManagement" in section && section.sessionManagement;

        if (isCollapsible && "sectionId" in section) {
          return (
            <SettingsCollapsibleCard
              body={section.body}
              icon={Icon}
              key={section.title}
              sectionId={section.sectionId}
              title={section.title}
            >
              {isWalletProfile ? <ProfileUsernameSettings embedded /> : null}
              {isSessionManagement ? (
                <SessionDeviceManagement embedded />
              ) : null}
            </SettingsCollapsibleCard>
          );
        }

        return (
          <article
            className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm"
            key={section.title}
          >
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {section.body}
                </p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}