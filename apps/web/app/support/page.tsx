"use client";

import Link from "next/link";

import { PlatformBrand } from "@/components/brand/platform-brand";
import { SupportCenter } from "@/components/support/support-center";

/**
 * SwiftPay Support as a page. Public: guests — like someone paying an invoice
 * without an account — get help here too.
 */
export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <PlatformBrand />
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground" href="/dashboard">
            Back to SwiftPay
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <SupportCenter variant="page" />
        </section>
      </div>
    </main>
  );
}
