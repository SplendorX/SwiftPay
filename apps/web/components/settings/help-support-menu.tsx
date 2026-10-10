"use client";

import { BookOpen, ChevronRight, MessagesSquare, ReceiptText } from "lucide-react";
import { useState, type ReactNode } from "react";

import { SupportCenter } from "@/components/support/support-center";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { bottomSheetClassName, useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type Panel = "chat" | "requests" | "topics";

const rows: Array<{ body: string; icon: ReactNode; id: Panel; title: string; tone: string }> = [
  {
    body: "Ask a question; ALLIE answers, and the SaphraONE team takes over when needed.",
    icon: <MessagesSquare className="h-5 w-5" />,
    id: "chat",
    title: "Chat with us",
    tone: "chat",
  },
  {
    body: "Track the requests you've sent the support team.",
    icon: <ReceiptText className="h-5 w-5" />,
    id: "requests",
    title: "Your requests",
    tone: "requests",
  },
  {
    body: "Frequently asked questions, by topic.",
    icon: <BookOpen className="h-5 w-5" />,
    id: "topics",
    title: "FAQs",
    tone: "faq",
  },
];

/**
 * Help & Support in Settings: a short menu, Kuda style. Each row slides the
 * support center up (from the side on desktop), opened straight where it says.
 */
export function HelpSupportMenu() {
  const side = useSheetSide();
  const [panel, setPanel] = useState<Panel | null>(null);

  return (
    <>
      <ul className="st-card">
        {rows.map((row) => (
          <li key={row.id}>
            <button className="st-row" onClick={() => setPanel(row.id)} type="button">
              <span className="st-help-icon" data-tone={row.tone}>
                {row.icon}
              </span>
              <span className="st-row-main">
                <span className="st-row-title">{row.title}</span>
                <span className="st-row-sub">{row.body}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      <Sheet onOpenChange={(next) => !next && setPanel(null)} open={panel !== null}>
        <SheetContent
          className={cn(
            "gap-0 overflow-hidden p-0",
            side === "bottom" ? bottomSheetClassName : "h-full w-full sm:max-w-md",
          )}
          showCloseButton={false}
          side={side}
        >
          <SheetTitle className="sr-only">Help &amp; Support</SheetTitle>
          <SheetDescription className="sr-only">Chat, your requests and FAQs</SheetDescription>
          {panel ? (
            // Keyed so each row opens fresh where it says.
            <SupportCenter initialView={panel} key={panel} onClose={() => setPanel(null)} variant="panel" />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
