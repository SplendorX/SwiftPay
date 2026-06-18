import { SlidersHorizontal } from "lucide-react";

import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { SettingsSections } from "@/components/settings/settings-sections";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SettingsPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Account preferences"
        title="Settings"
      >
        <section className="section-panel">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-eyebrow">Settings</p>
              <h2 className="section-title">Account preferences</h2>
              <p className="section-copy">
                Manage the profile-level defaults SwiftPay uses across wallet,
                payment, and privacy workflows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-primary shadow-sm">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
            </div>
          </div>

          <SettingsSections />
        </section>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}