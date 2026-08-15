"use client";

import { Bell, MonitorSmartphone, Wallet } from "lucide-react";

import { AlertsSettings } from "@/components/settings/alerts-settings";
import { ProfileUsernameSettings } from "@/components/settings/profile-username-settings";
import { SessionDeviceManagement } from "@/components/settings/session-device-management";
import { SettingsCollapsibleCard } from "@/components/settings/settings-collapsible-card";

export function SettingsSections() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SettingsCollapsibleCard
        body="Set your public username and profile picture, then switch between Circle and external wallet sessions from the account menu."
        icon={Wallet}
        sectionId="wallet-profile"
        title="Wallet profile"
      >
        <ProfileUsernameSettings embedded />
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
        body="Inbox, mute rules, and cleanup for payments, claims, and savings. Delete one notice or sweep the whole feed."
        icon={Bell}
        sectionId="alerts"
        title="Alerts"
      >
        <AlertsSettings />
      </SettingsCollapsibleCard>
    </div>
  );
}
