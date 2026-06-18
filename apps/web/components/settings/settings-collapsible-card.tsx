"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";

type SettingsCollapsibleCardProps = {
  body: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon: LucideIcon;
  sectionId: string;
  title: string;
};

function readStoredOpenState(storageKey: string, defaultOpen: boolean) {
  if (typeof window === "undefined") {
    return defaultOpen;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (stored === "0") {
    return false;
  }

  if (stored === "1") {
    return true;
  }

  return defaultOpen;
}

export function SettingsCollapsibleCard({
  body,
  children,
  defaultOpen = true,
  icon: Icon,
  sectionId,
  title,
}: SettingsCollapsibleCardProps) {
  const contentId = useId();
  const storageKey = `swiftpay.settings.section.${sectionId}`;
  const [open, setOpen] = useState(() =>
    readStoredOpenState(storageKey, defaultOpen),
  );

  useEffect(() => {
    setOpen(readStoredOpenState(storageKey, defaultOpen));
  }, [defaultOpen, storageKey]);

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      }

      return next;
    });
  }

  return (
    <article className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm sm:col-span-2">
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left transition hover:opacity-90"
        onClick={toggleOpen}
        type="button"
      >
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
          <p
            className={`mt-2 text-sm leading-6 text-muted-foreground ${
              open ? "" : "line-clamp-2"
            }`}
          >
            {body}
          </p>
        </div>
      </button>

      <div
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        id={contentId}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border pt-4">{children}</div>
        </div>
      </div>
    </article>
  );
}