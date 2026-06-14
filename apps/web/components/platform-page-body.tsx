"use client";

import type { ReactNode } from "react";

import { PlatformNav } from "@/components/platform-nav";
import { cn } from "@/lib/utils";

export function PlatformPageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-4 lg:grid-cols-[minmax(13rem,15rem)_minmax(0,1fr)] lg:items-start",
        className,
      )}
    >
      <PlatformNav />
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}