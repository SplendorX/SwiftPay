"use client";

import {
  BookOpen,
  Command,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  Search,
  Send,
  Settings,
  Users,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { platformNavItems } from "@/components/platform-nav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const navIcons: Record<string, typeof Command> = {
  "/dashboard": LayoutDashboard,
  "/swap": RefreshCw,
  "/swiftBatch": Users,
  "/pay": Send,
  "/privSwiftPay": LockKeyhole,
  "/docs": BookOpen,
  "/roadmap": Zap,
  "/settings": Settings,
};

const commandItems = platformNavItems;

export function CommandPaletteTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        className={cn(
          "hidden h-9 items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-background hover:text-foreground sm:inline-flex",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
        <kbd className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
      <CommandPalette onOpenChange={setOpen} open={open} />
    </>
  );
}

export function CommandPalette({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = commandItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery("");
      router.push(href);
    },
    [onOpenChange, router],
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton>
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Jump to any SwiftPay page
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages..."
              value={query}
            />
          </div>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto p-2">
          {filtered.map((item) => {
            const Icon = navIcons[item.href] ?? Command;
            return (
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-muted"
                key={item.href}
                onClick={() => navigate(item.href)}
                type="button"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching pages
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}