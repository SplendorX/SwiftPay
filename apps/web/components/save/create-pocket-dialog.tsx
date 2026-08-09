"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createSavingsPocket } from "@/lib/save/client";
import {
  POCKET_ICON_PRESETS,
  type SavingsPocketRecord,
} from "@/lib/save/types";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { cn } from "@/lib/utils";

type CreatePocketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerWallet: string;
  circleSocialUuid?: string;
  currency?: ArcTokenSymbol;
  onCreated: (pocket: SavingsPocketRecord) => void;
};

export function CreatePocketDialog({
  open,
  onOpenChange,
  ownerWallet,
  circleSocialUuid,
  currency = "USDC",
  onCreated,
}: CreatePocketDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("piggy");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [stopAtTarget, setStopAtTarget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setIcon("piggy");
    setDescription("");
    setTargetAmount("");
    setStopAtTarget(false);
    setError(null);
  }

  async function handleCreate() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) {
      setError("Pocket name must be 1–50 characters.");
      return;
    }

    try {
      setIsSaving(true);
      const { pocket } = await createSavingsPocket({
        ownerWallet,
        circleSocialUuid,
        name: trimmed,
        icon,
        description: description.trim() || undefined,
        targetAmount: targetAmount.trim() || undefined,
        stopAtTarget: targetAmount.trim() ? stopAtTarget : false,
        currency,
      });
      onCreated(pocket);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create pocket.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create savings pocket</DialogTitle>
          <DialogDescription>
            Separate money you want to save from money you want to spend. No
            interest or APY — just structure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Pocket name *
            </label>
            <Input
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emergency Fund"
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {POCKET_ICON_PRESETS.map((preset) => (
                <button
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition",
                    icon === preset.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40",
                  )}
                  key={preset.id}
                  onClick={() => setIcon(preset.id)}
                  title={preset.label}
                  type="button"
                >
                  {preset.emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Savings target (optional)
            </label>
            <Input
              inputMode="decimal"
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="1000"
              value={targetAmount}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Goal note (optional)
            </label>
            <Input
              maxLength={280}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="3 months of expenses"
              value={description}
            />
          </div>

          {targetAmount.trim() ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 text-sm">
              <input
                checked={stopAtTarget}
                className="mt-1"
                onChange={(e) => setStopAtTarget(e.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="font-medium">Stop saving when target is reached</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Spend&Save will only fill the remaining room. Leave unchecked
                  to continue saving beyond your target.
                </span>
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSaving} onClick={() => void handleCreate()} type="button">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create pocket"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
