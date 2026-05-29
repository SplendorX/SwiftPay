"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const platformNavItems = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/swap", label: "Swap" },
  { href: "/pay", label: "Payrequest" },
  { href: "/privSwiftPay", label: "privSwiftPay" },
  { href: "/docs", label: "Docs" },
  { href: "/roadmap", label: "Roadmap" },
];

const shouldPrefetchPlatformRoutes = process.env.NODE_ENV === "production";

export function PlatformNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Platform pages"
      className="surface-panel hidden min-w-0 p-2 lg:sticky lg:top-[5.75rem] lg:flex lg:max-h-[calc(100vh-7rem)] lg:w-full lg:flex-col lg:overflow-y-auto"
    >
      <div className="grid gap-1">
        {platformNavItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              className={`font-ui inline-flex min-h-10 w-full shrink-0 items-center justify-start rounded-md px-3 text-sm font-bold transition ${
                isActive
                  ? "bg-swift-600 text-white shadow-[0_10px_24px_rgba(66,17,143,0.18)] hover:bg-swift-700 hover:text-white"
                  : "text-muted hover:bg-white hover:text-swift-700"
              }`}
              href={item.href}
              key={item.href}
              prefetch={shouldPrefetchPlatformRoutes}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
