"use client";

import {
  ChevronRight,
  BookOpen,
  Home,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { platformNavItems } from "@/components/platform-nav";

const navIcons: Record<string, LucideIcon> = {
  "/": Home,
  "/dashboard": LayoutDashboard,
  "/docs": BookOpen,
  "/pay": Send,
  "/privSwiftPay": ShieldCheck,
  "/roadmap": Zap,
  "/settings": Settings,
  "/swap": RefreshCw,
};

const drawerNavItems = [
  ...platformNavItems,
  { href: "/settings", label: "Settings" },
];

const shouldPrefetchPlatformRoutes = process.env.NODE_ENV === "production";

export function PlatformNavDrawer() {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
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
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-bold shadow-sm transition hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2 ${
          open
            ? "border-swift-600 bg-swift-600 text-white hover:bg-swift-700"
            : "border-lavender-200 bg-white/80 text-ink hover:border-swift-600 hover:bg-white hover:text-swift-700"
        }`}
        onClick={() => setOpen((value) => !value)}
        title="Navigation"
        type="button"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[115] bg-swift-700/18 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <aside
            aria-label="Platform navigation"
            aria-modal="true"
            className="drawer-slide-panel absolute right-3 top-3 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-lavender-200 bg-white p-3 text-ink shadow-[0_24px_90px_rgba(18,11,32,0.28)]"
            onClick={(event) => event.stopPropagation()}
            ref={panelRef}
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-lavender-100 pb-3">
              <div>
                <p className="eyebrow">Platform</p>
                <h2 className="mt-2 font-heading text-lg font-semibold text-ink">
                  Navigation
                </h2>
              </div>
              <button
                aria-label="Close navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-lavender-200 bg-white/80 text-ink shadow-sm transition hover:border-swift-600 hover:text-swift-700"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="grid gap-2" aria-label="Slide navigation">
              {drawerNavItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                const Icon = navIcons[item.href] ?? ChevronRight;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-bold transition hover:-translate-y-0.5 ${
                      isActive
                        ? "border-swift-600 bg-swift-600 text-white shadow-[0_10px_24px_rgba(66,17,143,0.18)]"
                        : "border-lavender-100 bg-lavender-50 text-ink hover:border-swift-600 hover:bg-white hover:text-swift-700"
                    }`}
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
                      className={`h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 ${
                        isActive ? "text-white/70" : "text-muted"
                      }`}
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
