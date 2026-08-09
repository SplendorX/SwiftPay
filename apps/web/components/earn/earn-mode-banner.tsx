"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { earnModeBanner, type EarnMode } from "@/lib/earn/config";
import { cn } from "@/lib/utils";

export function EarnModeBanner({ mode }: { mode: EarnMode }) {
  const banner = earnModeBanner(mode);
  const Icon =
    banner.tone === "success"
      ? CheckCircle2
      : banner.tone === "warning"
        ? AlertTriangle
        : XCircle;

  return (
    <div
      className={cn(
        "earn-mode-banner",
        banner.tone === "success" && "earn-mode-banner-success",
        banner.tone === "warning" && "earn-mode-banner-warning",
        banner.tone === "danger" && "earn-mode-banner-danger",
      )}
      role="status"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="earn-mode-banner-title">{banner.title}</p>
        <p className="earn-mode-banner-body">{banner.body}</p>
      </div>
    </div>
  );
}
