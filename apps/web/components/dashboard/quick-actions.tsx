"use client";

import { motion } from "framer-motion";
import {
  ArrowDownUp,
  CalendarClock,
  LockKeyhole,
  QrCode,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const actions: Array<{
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: string;
}> = [
  { href: "#send", icon: Send, label: "Send Payment" },
  { href: "/pay", icon: QrCode, label: "Request Payment" },
  { href: "/swiftBatch", icon: Users, label: "Batch Settlement" },
  { href: "/swiftRecurepay", icon: CalendarClock, label: "SwiftRecurepay" },
  { href: "/swap", icon: ArrowDownUp, label: "Swap" },
  {
    href: "/privSwiftPay/private-send",
    icon: LockKeyhole,
    label: "Private Transfer",
    tone: "privacy",
  },
];

export function QuickActions({ className }: { className?: string }) {
  return (
    <div className={cn("quick-actions-grid", className)}>
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            key={action.href}
            transition={{ delay: index * 0.05, duration: 0.35 }}
          >
            <Link
              className={cn(
                "quick-action-card",
                action.tone === "privacy" && "quick-action-privacy",
              )}
              href={action.href}
            >
              <Icon className="h-4 w-4" />
              <span>{action.label}</span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}