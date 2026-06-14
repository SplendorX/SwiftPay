"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, LockKeyhole, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type FeedItem = {
  amount: string;
  icon: typeof ArrowUpRight;
  id: string;
  status: "confirmed" | "settled" | "private";
  time: string;
  title: string;
  tone: "in" | "out";
};

const feedItems: FeedItem[] = [
  {
    amount: "+$2,400.00",
    icon: ArrowDownLeft,
    id: "1",
    status: "confirmed",
    time: "Just now",
    title: "Invoice payment received",
    tone: "in",
  },
  {
    amount: "-$890.00",
    icon: ArrowUpRight,
    id: "2",
    status: "settled",
    time: "2m ago",
    title: "Payroll batch · 12 recipients",
    tone: "out",
  },
  {
    amount: "-$150.00",
    icon: LockKeyhole,
    id: "3",
    status: "private",
    time: "5m ago",
    title: "PrivSwiftPay claim funded",
    tone: "out",
  },
  {
    amount: "+$4,200.00",
    icon: Users,
    id: "4",
    status: "settled",
    time: "12m ago",
    title: "Settlement batch completed",
    tone: "in",
  },
];

const statusLabel: Record<FeedItem["status"], string> = {
  confirmed: "Confirmed",
  private: "Private",
  settled: "Settled",
};

export function FloatingActivity() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % feedItems.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  const item = feedItems[index];
  const Icon = item.icon;

  return (
    <div className="floating-activity">
      <div className="activity-feed shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            Live activity
          </p>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>

        <div className="floating-activity-content">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="activity-item"
              exit={{ opacity: 0, x: -16 }}
              initial={{ opacity: 0, x: 16 }}
              key={item.id}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="feature-icon h-7 w-7 shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground">{item.time}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    "text-xs font-bold",
                    item.tone === "in"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {item.amount}
                </p>
                <p className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  {statusLabel[item.status]}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}