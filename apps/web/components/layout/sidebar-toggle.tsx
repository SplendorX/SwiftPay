"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useSidebar } from "@/components/layout/sidebar-context";
import { Button } from "@/components/ui/button";

export function SidebarToggle() {
  const { retracted, toggleRetracted } = useSidebar();

  return (
    <Button
      aria-expanded={!retracted}
      aria-label={retracted ? "Show navigation" : "Hide navigation"}
      className="hidden h-9 w-9 shrink-0 lg:inline-flex"
      onClick={toggleRetracted}
      size="icon"
      type="button"
      variant="outline"
    >
      {retracted ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}