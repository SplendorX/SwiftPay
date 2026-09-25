"use client";

import type { ReactNode } from "react";

import { AllieMark } from "@/components/allie/AllieMark";
import { cn } from "@/lib/utils";

export type AllieMessageRole = "user" | "allie";

export function MessageBubble({
  children,
  role,
  /** False when this continues a run from the same speaker. */
  showAvatar = true,
  timestamp,
  badge,
}: {
  children: ReactNode;
  role: AllieMessageRole;
  showAvatar?: boolean;
  timestamp?: string;
  /** Shown beside the timestamp, e.g. which ALLIE tier answered. */
  badge?: ReactNode;
}) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full items-end gap-2",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {isUser ? null : (
        <span className="w-7 shrink-0">
          {showAvatar ? <AllieMark size={28} /> : null}
        </span>
      )}

      <div
        className={cn(
          "flex min-w-0 max-w-[min(30rem,82%)] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "allie-bubble w-full px-4 py-2.5 text-[0.9rem] leading-relaxed",
            isUser ? "allie-bubble-user" : "allie-bubble-allie",
          )}
        >
          {children}
        </div>

        {timestamp || badge ? (
          <span className="flex items-center gap-1.5 px-1 text-[0.68rem] text-muted-foreground">
            {badge}
            {timestamp}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AllieThinking() {
  return (
    <div className="flex w-full items-end gap-2">
      <AllieMark size={28} />
      <div className="flex items-center gap-2 rounded-[1.1rem] rounded-bl-md border border-border/70 bg-muted/40 px-3.5 py-3">
        <span aria-hidden className="allie-typing">
          <i />
          <i />
          <i />
        </span>
        <span className="sr-only">ALLIE is thinking</span>
      </div>
    </div>
  );
}
