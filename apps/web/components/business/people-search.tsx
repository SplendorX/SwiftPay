"use client";

import { Building2, Search, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchPeople } from "@/lib/business/client";
import type { DirectoryHit } from "@/lib/business/types";
import { cn } from "@/lib/utils";

export function PeopleSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
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
        className="hidden h-9 items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:border-primary/30 hover:text-foreground md:inline-flex"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search className="h-3.5 w-3.5" />
        Search people
      </button>
      <PeopleSearchDialog onOpenChange={setOpen} open={open} />
    </>
  );
}

export function PeopleSearchDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handle = query.trim();
    if (handle.length < 1) {
      setResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void searchPeople(handle)
        .then((payload) => setResults(payload.results))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [open, query]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">Search profiles</DialogTitle>
          <DialogDescription className="sr-only">
            Find SwiftPay users and businesses
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search @username"
              value={query}
            />
          </div>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : null}
          {!loading && query && results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching profiles
            </p>
          ) : null}
          {results.map((item) => (
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted",
              )}
              key={`${item.kind}-${item.username}`}
              onClick={() => {
                onOpenChange(false);
                router.push(`/u/${item.username}`);
              }}
              type="button"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted text-primary">
                {item.avatarUrl ? (
                  <img alt="" className="h-full w-full object-cover" src={item.avatarUrl} />
                ) : item.kind === "business" ? (
                  <Building2 className="h-4 w-4" />
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{item.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{item.username}
                  {item.kind === "business" ? " · Business" : ""}
                  {item.verificationStatus === "VERIFIED" ? " · Verified" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
