"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PlatformWordmark } from "@/components/brand/platform-wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const marketingLinks = [
  { href: "/docs", label: "Documentation" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "#products", label: "Product" },
];

export function MarketingNav() {
  const pathname = usePathname();

  return (
    <header className="marketing-nav">
      <div className="marketing-nav-inner">
        <Link className="marketing-brand" href="/">
          <PlatformWordmark />
        </Link>

        <nav aria-label="Marketing" className="hidden items-center gap-1 md:flex">
          {marketingLinks.map((link) => (
            <Link
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                pathname === link.href
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild className="hidden sm:inline-flex" size="sm" variant="ghost">
            <Link href="/docs">Docs</Link>
          </Button>
          <Button asChild size="sm">
            <a href="#sign-in">Get started</a>
          </Button>
        </div>
      </div>
    </header>
  );
}