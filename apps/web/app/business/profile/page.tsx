"use client";

import { AccountProfileSettings } from "@/components/settings/account-profile-settings";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

function ProfileEditor() {
  return (
    <section className="section-panel max-w-lg p-6">
      <AccountProfileSettings />
    </section>
  );
}

export default function BusinessProfilePage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Public business branding on SwiftPay"
        title="Business profile"
      >
        <ProfileEditor />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
