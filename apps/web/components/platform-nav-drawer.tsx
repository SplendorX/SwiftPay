"use client";

import { ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { SidebarBrand } from "@/components/layout/sidebar-brand";
import { platformNavItems } from "@/components/platform-nav";
import { cn } from "@/lib/utils";

const shouldPrefetchPlatformRoutes = process.env.NODE_ENV === "production";

export function PlatformNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative z-[110] lg:hidden">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open navigation"
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold shadow-sm transition",
          open
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground hover:border-primary/30",
        )}
        onClick={() => setOpen((value) => !value)}
        title="Navigation"
        type="button"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[115] bg-background/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <aside
            aria-label="Platform navigation"
            aria-modal="true"
            className="drawer-slide-panel absolute top-3 right-3 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-3 text-foreground shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
              <SidebarBrand />
              <button
                aria-label="Close navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav aria-label="Slide navigation" className="grid gap-1.5">
              {platformNavItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                    prefetch={shouldPrefetchPlatformRoutes}
                  >
                    <span className="inline-flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 transition group-hover:translate-x-0.5",
                        isActive ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    />
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}