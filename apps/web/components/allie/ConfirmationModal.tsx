"use client";

import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The human approval gate. Nothing reaches the execution engine until the
 * person clicks through this.
 */
export function ConfirmationModal({
  amountLabel,
  busy,
  confirmLabel = "Confirm & Pay",
  description,
  onCancel,
  onConfirm,
  open,
  recipientLabel,
  requiresApproval,
  title = "Confirm this payment",
  tone = "default",
}: {
  amountLabel?: string;
  busy?: boolean;
  confirmLabel?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  recipientLabel?: string;
  requiresApproval?: boolean;
  title?: string;
  tone?: "default" | "destructive";
}) {
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !busy) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {amountLabel || recipientLabel ? (
          <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            {recipientLabel ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Recipient</span>
                <span className="min-w-0 truncate font-semibold">
                  {recipientLabel}
                </span>
              </div>
            ) : null}
            {amountLabel ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{amountLabel}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {requiresApproval ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            This amount is above your auto-approve threshold.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={onConfirm}
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
