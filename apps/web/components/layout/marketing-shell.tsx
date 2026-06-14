"use client";

import type { ReactNode } from "react";

import { AmbientBackground } from "@/components/design/ambient-background";
import { MarketingNav } from "@/components/layout/marketing-nav";
import { cn } from "@/lib/utils";

export function MarketingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("marketing-shell", className)}>
      <AmbientBackground variant="hero" />
      <MarketingNav />
      <div className="marketing-content">{children}</div>
    </div>
  );
}