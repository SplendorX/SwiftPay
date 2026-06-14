import Link from "next/link";

import { PlatformWordmark } from "@/components/brand/platform-wordmark";
import { cn } from "@/lib/utils";

type SidebarBrandProps = {
  className?: string;
  href?: string;
};

export function SidebarBrand({
  className,
  href = "/",
}: SidebarBrandProps) {
  return (
    <Link
      aria-label="SwiftPay home"
      className={cn("app-sidebar-brand-link", className)}
      href={href}
    >
      <PlatformWordmark />
    </Link>
  );
}