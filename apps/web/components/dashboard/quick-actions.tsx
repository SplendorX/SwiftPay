"use client";

import { motion } from "framer-motion";
import {
  ArrowDownUp,
  CalendarClock,
  PiggyBank,
  QrCode,
  Send,
  TrendingUp,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

const actions: Array<{
  href: string;
  icon: LucideIcon;
  label: string;
}> = [
  { href: "#send", icon: Send, label: "Send Payment" },
  { href: "/swiftCircle", icon: UsersRound, label: "Circle" },
  { href: "/save", icon: PiggyBank, label: "Save" },
  { href: "/earn", icon: TrendingUp, label: "Earn" },
  { href: "/pay", icon: QrCode, label: "Request Payment" },
  { href: "/swiftBatch", icon: Users, label: "BatchPay" },
  { href: "/swiftRecurepay", icon: CalendarClock, label: "RecurePay" },
  { href: "/swap", icon: ArrowDownUp, label: "Swap" },
];

export function QuickActions({ className }: { className?: string }) {
  const t = useT();
  const labels: Record<string, string> = {
    "#send": t("dashboard.sendPayment"),
    "/swiftCircle": t("nav.circle"),
    "/save": t("nav.save"),
    "/earn": t("nav.earn"),
    "/pay": t("dashboard.requestPayment"),
    "/swiftBatch": t("nav.batchPay"),
    "/swiftRecurepay": t("nav.recurePay"),
    "/swap": t("nav.swap"),
  };

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
              className="quick-action-card"
              href={action.href}
            >
              <Icon className="h-4 w-4" />
              <span>{labels[action.href] ?? action.label}</span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}