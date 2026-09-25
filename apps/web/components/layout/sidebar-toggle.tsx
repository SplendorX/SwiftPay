"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useSidebar } from "@/components/layout/sidebar-context";
import { Button } from "@/components/ui/button";

export function SidebarToggle() {
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <Button
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      className="h-9 w-9 shrink-0"
      onClick={toggleCollapsed}
      size="icon"
      type="button"
      variant="outline"
    >
      {collapsed ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}