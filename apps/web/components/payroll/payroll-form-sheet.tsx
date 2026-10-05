"use client";

import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import { useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/** A payroll form in a sheet: up from the bottom on phones, from the side on desktop. */
export function PayrollFormSheet({
  children,
  description,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const side = useSheetSide();
  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent
        className={cn(
          "gap-0 p-0",
          side === "bottom" ? "max-h-[92dvh] rounded-t-[1.75rem] border-t-0" : "w-full sm:max-w-md",
        )}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
          <div className="grid gap-1 text-center">
            <SheetTitle className="text-lg font-bold">{title}</SheetTitle>
            <SheetDescription className={description ? "text-sm text-muted-foreground" : "sr-only"}>
              {description ?? title}
            </SheetDescription>
          </div>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
