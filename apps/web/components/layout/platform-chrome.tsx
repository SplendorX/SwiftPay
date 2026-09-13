"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { OnboardingRedirect } from "@/components/business/workspace-provider";
import { AppFrame } from "@/components/layout/app-frame";
import { AppHeader } from "@/components/layout/app-header";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { useT } from "@/components/locale-provider";
import { pageCopyForPath } from "@/lib/i18n";

type PlatformChromeProps = {
  actions?: ReactNode;
  children: ReactNode;
  hideHeader?: boolean;
  subtitle?: string;
  title: string;
};

export function PlatformChrome({
  actions,
  children,
  hideHeader,
  subtitle,
  title,
}: PlatformChromeProps) {
  const pathname = usePathname();
  const t = useT();
  const copy = pageCopyForPath(pathname);
  const resolvedTitle = copy ? t(copy.title) : title;
  const resolvedSubtitle = copy?.subtitle ? t(copy.subtitle) : subtitle;

  return (
    <>
      <OnboardingRedirect />
      <SidebarProvider>
        <div className="platform-shell w-full min-w-0 bg-background">
          <AppHeader actions={actions} />
          <AppFrame
            hideHeader={hideHeader}
            subtitle={resolvedSubtitle}
            title={resolvedTitle}
          >
            {children}
          </AppFrame>
        </div>
      </SidebarProvider>
    </>
  );
}