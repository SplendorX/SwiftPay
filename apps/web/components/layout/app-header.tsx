"use client";

import type { ReactNode } from "react";

import { CommandPaletteTrigger } from "@/components/command-palette";
import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { SidebarToggle } from "@/components/layout/sidebar-toggle";
import { PlatformNavDrawer } from "@/components/platform-nav-drawer";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  actions?: ReactNode;
  className?: string;
};

export function AppHeader({ actions, className }: AppHeaderProps) {
  return (
    <header className={cn("app-topbar", className)}>
      <div className="app-topbar-inner">
        <SidebarToggle />
        <SidebarBrand />

        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <CommandPaletteTrigger />
          <ThemeToggle />
          {actions}
          <PlatformNavDrawer />
        </div>
      </div>
    </header>
  );
}