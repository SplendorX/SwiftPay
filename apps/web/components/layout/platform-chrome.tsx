"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AccountProvider } from "@/components/account/account-provider";
import {
  OnboardingRedirect,
  WorkspaceProvider,
} from "@/components/business/workspace-provider";
import { AppFrame } from "@/components/layout/app-frame";
import { AppHeader } from "@/components/layout/app-header";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { useT } from "@/components/locale-provider";
import { pageCopyForPath } from "@/lib/i18n";

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
  const pathname = usePathname();
  const t = useT();
  const copy = pageCopyForPath(pathname);
  const resolvedTitle = copy ? t(copy.title) : title;
  const resolvedSubtitle = copy?.subtitle ? t(copy.subtitle) : subtitle;

  return (
    <WorkspaceProvider>
      <AccountProvider>
        <OnboardingRedirect />
        <SidebarProvider>
          <div className="platform-shell bg-background">
            <AppHeader actions={actions} />
            <AppFrame subtitle={resolvedSubtitle} title={resolvedTitle}>
              {children}
            </AppFrame>
          </div>
        </SidebarProvider>
      </AccountProvider>
    </WorkspaceProvider>
  );
}