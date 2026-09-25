"use client";

import { ArrowUpRight, ExternalLink, Wallet } from "lucide-react";
import Link from "next/link";

import { AllieMark } from "@/components/allie/AllieMark";
import { Button } from "@/components/ui/button";
import type { AllieOutcome } from "@/lib/allie/client";

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5 rounded-xl border border-border bg-background p-3">
      {/* Rows are a rendered list, not a keyed set — two legs of the same batch
          can legitimately read the same label and value, so position is the
          only identity they have. */}
      {rows.map((row, index) => (
        <div
          className="flex items-baseline justify-between gap-3 text-[0.82rem]"
          key={`${index}-${row.label}`}
        >
          <span className="min-w-0 truncate text-muted-foreground">
            {row.label}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Action({ cta, href }: { cta?: string; href?: string }) {
  if (!cta || !href) {
    return null;
  }

  const external = href.startsWith("http");

  return (
    <Button asChild className="mt-3 w-full" size="sm">
      {external ? (
        <a href={href} rel="noreferrer noopener" target="_blank">
          {cta}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <Link href={href}>
          {cta}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </Button>
  );
}

/**
 * Renders everything ALLIE can produce that is not a payment awaiting
 * confirmation: answers from SwiftPay's own data, and hand-offs to the product
 * that owns an action she cannot sign for.
 */
export function OutcomeCard({ outcome }: { outcome: AllieOutcome }) {
  if (outcome.kind === "message") {
    return null;
  }

  const isPrepare = outcome.kind === "prepare";

  return (
    <div className="w-full rounded-[1.1rem] border border-border bg-card p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        {isPrepare ? (
          <Wallet className="h-4 w-4 text-primary" />
        ) : (
          <AllieMark size={18} />
        )}
        <p className="text-[0.85rem] font-semibold">{outcome.title}</p>
      </div>

      {outcome.summary ? (
        <p className="mb-2.5 text-[0.82rem] leading-relaxed text-muted-foreground">
          {outcome.summary}
        </p>
      ) : null}

      <Rows rows={outcome.rows} />

      {isPrepare ? (
        <p className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[0.74rem] leading-relaxed text-amber-700 dark:text-amber-300">
          {outcome.handoff}
        </p>
      ) : null}

      <Action cta={outcome.cta} href={outcome.href} />
    </div>
  );
}
