"use client";

import { CheckCircle2, ExternalLink, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export type SuccessPopupRow = {
  label: string;
  value: string;
};

export type SuccessPopupDetail = {
  amount?: string;
  eyebrow?: string;
  explorerUrl?: string;
  rows?: SuccessPopupRow[];
  subtitle?: string;
  title: string;
};

export const successPopupEventName = "swiftpay:success";

export function showSuccess(detail: SuccessPopupDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<SuccessPopupDetail>(successPopupEventName, { detail }),
  );
}

export function SuccessPopup({
  children,
  detail,
  onClose,
  open,
}: {
  children?: ReactNode;
  detail: SuccessPopupDetail;
  onClose: () => void;
  open: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="sp-success-overlay"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="sp-success-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              {detail.eyebrow ? (
                <p className="eyebrow">{detail.eyebrow}</p>
              ) : null}
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
                {detail.title}
              </h2>
              {detail.subtitle ? (
                <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
                  {detail.subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border border-border bg-card text-foreground transition hover:border-primary/30 hover:bg-primary hover:text-primary-foreground"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {detail.amount ? (
          <div className="rounded-[1.2rem] border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
              Amount
            </p>
            <p className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
              {detail.amount}
            </p>
          </div>
        ) : null}

        {detail.rows && detail.rows.length > 0 ? (
          <div className="mt-4 grid gap-2 rounded-[1.1rem] border border-border bg-card/80 px-3 py-3 text-sm">
            {detail.rows.map((row) => (
              <div
                className="flex items-start justify-between gap-3"
                key={`${row.label}-${row.value}`}
              >
                <span className="font-bold text-muted-foreground">{row.label}</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {detail.explorerUrl ? (
            <a
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary"
              href={detail.explorerUrl}
              rel="noreferrer"
              target="_blank"
            >
              ArcScan
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
          {children}
          <button
            className="inline-flex h-11 flex-1 items-center justify-center rounded-[1rem] bg-primary px-4 text-sm font-bold text-primary-foreground sm:flex-none"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuccessPopupHost() {
  const [detail, setDetail] = useState<SuccessPopupDetail | null>(null);

  useEffect(() => {
    function onSuccess(event: Event) {
      const custom = event as CustomEvent<SuccessPopupDetail>;
      if (custom.detail?.title) {
        setDetail(custom.detail);
      }
    }

    window.addEventListener(successPopupEventName, onSuccess);
    return () => window.removeEventListener(successPopupEventName, onSuccess);
  }, []);

  return (
    <SuccessPopup
      detail={detail ?? { title: "Done" }}
      onClose={() => setDetail(null)}
      open={Boolean(detail)}
    />
  );
}
