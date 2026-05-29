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
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-bold shadow-sm transition hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2 ${
        isActive
          ? "border-swift-600 bg-swift-600 text-white hover:bg-swift-700"
          : "border-lavender-200 bg-white/80 text-ink hover:border-swift-600 hover:bg-white hover:text-swift-700"
      }`}
      href="/settings"
      title="Settings"
    >
      <Settings className="h-4 w-4" />
    </Link>
  );
}
