"use client";

import {
  CalendarClock,
  Command,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  Search,
  Send,
  Settings,
  TrendingUp,
  Users,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useOptionalAccount } from "@/components/account/account-provider";
import { platformNavItems } from "@/components/platform-nav";
import { searchPeople } from "@/lib/business/client";
import type { DirectoryHit } from "@/lib/business/types";
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
  "/business": LayoutDashboard,
  "/business/invoices": Send,
  "/save": PiggyBank,
  "/earn": TrendingUp,
  "/swap": RefreshCw,
  "/swiftBatch": Users,
  "/swiftCircle": UsersRound,
  "/swiftRecurepay": CalendarClock,
  "/pay": Send,
  "/settings": Settings,
};

export function CommandPaletteTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (!typing && event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        aria-label="Search people and pages"
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/70 text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-background hover:text-foreground sm:h-11 sm:w-auto sm:gap-2 sm:px-3 sm:text-xs sm:font-medium",
          className,
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search people & pages</span>
        <kbd className="hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] sm:inline">
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
  const isBusiness = useOptionalAccount()?.isBusiness ?? false;
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<DirectoryHit[]>([]);
  const commandItems = platformNavItems.filter(
    (item) => !item.businessOnly || isBusiness,
  );

  const filtered = commandItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const handle = query.trim().replace(/^@+/, "");
    if (handle.length < 1) {
      setPeople([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      void searchPeople(handle)
        .then((payload) => setPeople(payload.results))
        .catch(() => setPeople([]));
    }, 160);
    return () => window.clearTimeout(timeout);
  }, [query]);

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
          <DialogTitle className="text-sm">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search people, businesses, and pages
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search @username, businesses, or pages"
              value={query}
            />
          </div>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto p-2">
          {people.length > 0 ? (
            <div className="pb-2">
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                People & businesses
              </p>
              {people.map((person) => (
                <button
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-muted"
                  key={`${person.kind}-${person.username}`}
                  onClick={() => navigate(`/u/${person.username}`)}
                  type="button"
                >
                  {person.avatarUrl ? (
                    <img
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                      src={person.avatarUrl}
                    />
                  ) : (
                    <Search className="h-4 w-4 text-muted-foreground" />
                  )}
                  {person.displayName}
                  <span className="text-xs text-muted-foreground">
                    @{person.username}
                    {person.kind === "business" ? " · Business" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
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
          {filtered.length === 0 && people.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching pages
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
