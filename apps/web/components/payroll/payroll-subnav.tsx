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
    <div className="mb-6 overflow-x-auto">
      <nav className="inline-flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
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
                "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-all",
                isActive
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
