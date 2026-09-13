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
    <div className="flex border-b border-border mb-6 overflow-x-auto">
      <nav className="flex space-x-2">
        {links.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
