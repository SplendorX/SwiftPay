"use client";

import type { ReactNode } from "react";

import { AmbientBackground } from "@/components/design/ambient-background";
import { cn } from "@/lib/utils";

type AppShellProps = {
  ambient?: "default" | "hero" | "dashboard";
  children: ReactNode;
  className?: string;
};

export function AppShell({
  ambient = "default",
  children,
  className,
}: AppShellProps) {
  return (
    <main
      className={cn(
        "relative min-h-screen overflow-x-hidden px-3 py-4 text-foreground sm:px-6 lg:px-8",
        className,
      )}
    >
      <AmbientBackground variant={ambient} />
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-col gap-5">
        {children}
      </div>
    </main>
  );
}