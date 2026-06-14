import {
  Bell,
  Database,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { ThemeToggle } from "@/components/theme-toggle";

const settingsSections = [
  {
    body: "Recent privacy codes and payroll folders are stored per active wallet profile.",
    icon: Database,
    title: "Wallet-scoped storage",
  },
  {
    body: "Use the account menu to switch between Circle and external wallet sessions.",
    icon: Wallet,
    title: "Wallet profile",
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
];

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

          <div className="grid gap-3 sm:grid-cols-2">
            {settingsSections.map((section) => {
              const Icon = section.icon;

              return (
                <article
                  className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm"
                  key={section.title}
                >
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
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
        </section>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}