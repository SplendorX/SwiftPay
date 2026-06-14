"use client";

import type { ReactNode } from "react";

import { AppFrame } from "@/components/layout/app-frame";
import { AppHeader } from "@/components/layout/app-header";
import { SidebarProvider } from "@/components/layout/sidebar-context";

type PlatformChromeProps = {
  actions?: ReactNode;
  children: ReactNode;
  subtitle?: string;
  title: string;
};

export function PlatformChrome({
  actions,
  children,
  subtitle,
  title,
}: PlatformChromeProps) {
  return (
    <SidebarProvider>
      <div className="platform-shell bg-background">
        <AppHeader actions={actions} />
        <AppFrame subtitle={subtitle} title={title}>
          {children}
        </AppFrame>
      </div>
    </SidebarProvider>
  );
}