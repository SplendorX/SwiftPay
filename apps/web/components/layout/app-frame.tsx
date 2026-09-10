"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="app-frame">
      <aside
        aria-hidden={retracted}
        className={cn(
          "app-sidebar",
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
          <p className="app-page-kicker">SwiftPay</p>
          <h1 className="font-heading">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="app-main-content"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          key={pathname}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}