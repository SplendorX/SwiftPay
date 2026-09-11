"use client";

import {
  Briefcase,
  CalendarClock,
  FileText,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  Send,
  Settings,
  TrendingUp,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOptionalAccount } from "@/components/account/account-provider";
import { cn } from "@/lib/utils";

export const platformNavItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/business",
    label: "Overview",
    icon: Briefcase,
    businessOnly: true,
  },
  {
    href: "/business/invoices",
    label: "Invoices",
    icon: FileText,
    businessOnly: true,
  },
  { href: "/pay", label: "Request", icon: Send },
  { href: "/swap", label: "Swap", icon: RefreshCw },
  { href: "/swiftCircle", label: "Circle", icon: UsersRound },
  { href: "/save", label: "Save", icon: PiggyBank },
  { href: "/earn", label: "Earn", icon: TrendingUp },
  { href: "/swiftBatch", label: "BatchPay", icon: Users },
  { href: "/swiftRecurepay", label: "RecurePay", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
] satisfies Array<{
  businessOnly?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}>;

export const businessNavItems = platformNavItems;

const shouldPrefetchPlatformRoutes = process.env.NODE_ENV === "production";

export function PlatformNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const isBusiness = useOptionalAccount()?.isBusiness ?? false;
  const items = platformNavItems.filter((item) => !item.businessOnly || isBusiness);

  return (
    <nav aria-label="Platform" className={cn("app-nav", className)}>
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/business" && pathname.startsWith(`${item.href}/`));
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
