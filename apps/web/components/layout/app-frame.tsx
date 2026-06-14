"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";

import { useSidebar } from "@/components/layout/sidebar-context";
import { PlatformNav } from "@/components/platform-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppFrameProps = {
  actions?: ReactNode;
  children: ReactNode;
  subtitle?: string;
  title: string;
};

export function AppFrame({ children, subtitle, title }: AppFrameProps) {
  const { collapsed, retracted, toggleCollapsed } = useSidebar();

  return (
    <div className="app-frame">
      <aside
        aria-hidden={retracted}
        className={cn(
          "app-sidebar hidden lg:flex",
          collapsed && !retracted && "app-sidebar-collapsed",
          retracted && "app-sidebar-retracted",
        )}
      >
        <PlatformNav />

        <div className="app-sidebar-footer">
          <Button
            className="w-full justify-start"
            disabled={retracted}
            onClick={toggleCollapsed}
            size="sm"
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      <div className="app-main">
        <div className="app-page-title">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="app-main-content">{children}</div>
      </div>
    </div>
  );
}