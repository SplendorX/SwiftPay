"use client";

import {
  Banknote,
  Gift,
  ChartNoAxesColumn,
  LayoutDashboard,
  PiggyBank,
  Settings,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOptionalAccount } from "@/components/account/account-provider";
import { useT } from "@/components/locale-provider";
import { navLabelKeys } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The sidebar carries the places you live in. Overview, Invoices, Request and
 * Swap are task pages reached from the dashboard's quick actions board
 * instead, so they are deliberately absent here.
 */
export const platformNavItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/business/payroll",
    label: "Payroll",
    icon: Banknote,
    businessOnly: true,
  },
  { href: "/circle", label: "Circle", icon: UsersRound },
  { href: "/save", label: "Save", icon: PiggyBank },
  { href: "/earn", label: "Earn", icon: TrendingUp },
  { href: "/insights", label: "Insights", icon: ChartNoAxesColumn },
  { href: "/referral", label: "Invite & Earn", icon: Gift },
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
  const t = useT();
  const accountContext = useOptionalAccount();

  const hasBusinessAccess = Boolean(accountContext?.isBusiness);

  const items = platformNavItems.filter((item) => !item.businessOnly || hasBusinessAccess);

  return (
    <nav aria-label={t("common.platformNav")} className={cn("app-nav", className)}>
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/business" && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;
        const labelKey = navLabelKeys[item.href as keyof typeof navLabelKeys];

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
            <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={2.25} />
            <span className="truncate">{labelKey ? t(labelKey) : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
