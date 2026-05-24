import {
  Bell,
  Database,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformPageBody } from "@/components/platform-page-body";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
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
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="surface-panel sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link
            className="flex min-w-0 items-center gap-3 justify-self-start"
            href="/"
          >
            <BrandMark className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="truncate text-sm font-semibold text-muted sm:text-base">
                Settings
              </p>
            </div>
          </Link>

          <PlatformProfileControls />
        </header>

        <PlatformPageBody>
        <section className="surface-panel p-4 sm:p-5">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Settings</p>
              <h1 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                Account preferences
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Manage the profile-level defaults SwiftPay uses across wallet,
                payment, and privacy workflows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-lavender-200 bg-white/80 text-swift-700 shadow-sm">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {settingsSections.map((section) => {
              const Icon = section.icon;

              return (
                <article
                  className="rounded-lg border border-lavender-100 bg-white/85 px-4 py-4 shadow-sm"
                  key={section.title}
                >
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-lavender-50 text-swift-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-black text-ink">
                        {section.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {section.body}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        </PlatformPageBody>
      </div>
    </main>
    </PlatformAccessGate>
  );
}
