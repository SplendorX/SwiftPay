"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsButton() {
  const pathname = usePathname();
  const isActive = pathname === "/settings";

  return (
    <Link
      aria-label="Settings"
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
        isActive
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-accent"
      }`}
      href="/settings"
      title="Settings"
    >
      <Settings className="h-4 w-4" />
    </Link>
  );
}