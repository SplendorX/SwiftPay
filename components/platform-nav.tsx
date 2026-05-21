"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/swap", label: "Swap" },
  { href: "/pay", label: "Payrequest" },
  { href: "/privSwiftPay", label: "privSwiftPay" },
];

export function PlatformNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Platform pages"
      className="flex w-full min-w-0 justify-self-center overflow-x-auto rounded-lg border border-lavender-100 bg-white/75 p-1 shadow-sm lg:w-auto lg:max-w-full"
    >
      <div className="mx-auto flex min-w-max items-center justify-center gap-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              className={`font-ui inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-bold transition hover:bg-white hover:text-swift-700 ${
                isActive
                  ? "bg-ink text-white shadow-sm hover:bg-ink hover:text-white"
                  : "text-muted"
              }`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
