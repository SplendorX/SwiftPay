"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useSidebar } from "@/components/layout/sidebar-context";
import { useT } from "@/components/locale-provider";
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
  const t = useT();
  const isCircleRoom = /^\/swiftCircle\/[^/]+$/.test(pathname);

  return (
    <div className="app-frame w-full min-w-0">
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
                <span>{t("common.collapse")}</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      <div className={cn("app-main min-w-0 w-full", isCircleRoom && "app-main-circle-room")}>
        <div className={cn("app-page-title", isCircleRoom && "app-page-title-circle-room")}>
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
          className="app-main-content min-w-0 w-full"
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