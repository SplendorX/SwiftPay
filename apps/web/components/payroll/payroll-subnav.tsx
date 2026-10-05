"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, Calendar, Layers, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/business/payroll", label: "Dashboard", icon: Banknote, exact: true },
  { href: "/business/payroll/team", label: "Team", icon: Users },
  { href: "/business/payroll/groups", label: "Groups", icon: Layers },
  { href: "/business/payroll/schedules", label: "Schedules", icon: Calendar },
];

export function PayrollSubnav() {
  const pathname = usePathname();

  return (
    <div className="payroll-subnav mb-6 overflow-x-auto [scrollbar-width:none]">
      <nav className="inline-flex gap-2">
        {links.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                isActive
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className="h-4 w-4"
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
