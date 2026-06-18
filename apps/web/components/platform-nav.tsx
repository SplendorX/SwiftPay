"use client";

import {
  BookOpen,
  CalendarClock,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  Send,
  Settings,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export const platformNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/swap", label: "Swap", icon: RefreshCw },
  { href: "/swiftBatch", label: "SwiftBatch", icon: Users },
  { href: "/swiftRecurepay", label: "SwiftRecurepay", icon: CalendarClock },
  { href: "/pay", label: "Request", icon: Send },
  { href: "/privSwiftPay", label: "PrivSwiftPay", icon: LockKeyhole },
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/roadmap", label: "Roadmap", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
] satisfies Array<{ href: string; label: string; icon: LucideIcon }>;

const shouldPrefetchPlatformRoutes = process.env.NODE_ENV === "production";

export function PlatformNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Platform" className={cn("app-nav", className)}>
      {platformNavItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "app-nav-link",
              isActive && "app-nav-link-active",
            )}
            href={item.href}
            key={item.href}
            prefetch={shouldPrefetchPlatformRoutes}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}