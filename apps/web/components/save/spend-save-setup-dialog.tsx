"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { CreatePocketDialog } from "@/components/save/create-pocket-dialog";
import { formatMoneyShort } from "@/components/save/format";
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
import { saveSpendSaveConfig } from "@/lib/save/client";
import { calculateSaveAmountUnits, formatUnitsToDecimal } from "@/lib/save/decimal";
import {
  PRESET_SPEND_SAVE_PERCENTAGES,
  getPocketEmoji,
  type SavingsPocketRecord,
  type SpendSaveConfigRecord,
} from "@/lib/save/types";
import { arcTestnetTokens } from "@/lib/tokens";
import { cn } from "@/lib/utils";

type SpendSaveSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerWallet: string;
  circleSocialUuid?: string;
  pockets: SavingsPocketRecord[];
  onPocketsChange: (pockets: SavingsPocketRecord[]) => void;
  onSaved: (config: SpendSaveConfigRecord) => void;
};

export function SpendSaveSetupDialog({
  open,
  onOpenChange,
  ownerWallet,
  circleSocialUuid,
  pockets,
  onPocketsChange,
  onSaved,
}: SpendSaveSetupDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pocketId, setPocketId] = useState<string>("");
  const [percentage, setPercentage] = useState("5.00");
  const [customMode, setCustomMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedPocket = pockets.find((p) => p.id === pocketId) ?? null;

  const previews = useMemo(() => {
    const samples = ["100", "500", "1000"];
    const decimals = arcTestnetTokens.USDC.decimals;
    return samples.map((sample) => {
      const paymentUnits = BigInt(sample) * 10n ** BigInt(decimals);
      try {
        const saveUnits = calculateSaveAmountUnits(paymentUnits, percentage);
        return {
          spend: formatMoneyShort(sample),
          save: formatMoneyShort(formatUnitsToDecimal(saveUnits, decimals)),
        };
      } catch {
        return { spend: formatMoneyShort(sample), save: "n/a" };
      }
    });
  }, [percentage]);

  function reset() {
    setStep(1);
    setPocketId("");
    setPercentage("5.00");
    setCustomMode(false);
    setError(null);
  }

  async function handleActivate() {
    setError(null);
    if (!pocketId) {
      setError("Choose a savings pocket.");
      return;
    }
    try {
      setIsSaving(true);
      const { config } = await saveSpendSaveConfig({
        ownerWallet,
        circleSocialUuid,
        pocketId,
        percentage,
        enabled: true,
        eligiblePaymentType: "all_outgoing",
      });
      onSaved(config);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not activate Spend&Save.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up Spend&Save</DialogTitle>
            <DialogDescription>
              Automatically save a percentage whenever you make an eligible
              payment. Your merchant still receives the full payment amount.
              the savings is extra from your balance.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-2 flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <div
                className={cn(
                  "h-1 flex-1 rounded-full",
                  step >= n ? "bg-primary" : "bg-muted",
                )}
                key={n}
              />
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Choose savings pocket</p>
              {pockets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Create a pocket first to receive automatic savings.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {pockets.map((pocket) => (
                    <button
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                        pocketId === pocket.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40",
                      )}
                      key={pocket.id}
                      onClick={() => setPocketId(pocket.id)}
                      type="button"
                    >
                      <span className="text-xl">
                        {getPocketEmoji(pocket.icon)}
                      </span>
                      <span className="flex-1 text-sm font-medium">
                        {pocket.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMoneyShort(pocket.current_balance)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Button
                onClick={() => setCreateOpen(true)}
                type="button"
                variant="outline"
              >
                Create new pocket
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Choose savings percentage</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_SPEND_SAVE_PERCENTAGES.map((pct) => (
                  <button
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      !customMode && Number(percentage) === pct
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/40",
                    )}
                    key={pct}
                    onClick={() => {
                      setCustomMode(false);
                      setPercentage(`${pct}.00`);
                    }}
                    type="button"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    customMode
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/40",
                  )}
                  onClick={() => setCustomMode(true)}
                  type="button"
                >
                  Custom
                </button>
              </div>
              {customMode ? (
                <div className="space-y-2">
                  <Input
                    inputMode="decimal"
                    max={50}
                    min={1}
                    onChange={(e) => setPercentage(e.target.value)}
                    step="0.01"
                    type="number"
                    value={percentage}
                  />
                  <input
                    className="w-full"
                    max={50}
                    min={1}
                    onChange={(e) =>
                      setPercentage(Number(e.target.value).toFixed(2))
                    }
                    step={1}
                    type="range"
                    value={Math.min(50, Math.max(1, Number(percentage) || 1))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Custom range: 1% – 50%
                  </p>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Save {percentage}% of every eligible payment
                {selectedPocket ? ` into ${selectedPocket.name}` : ""}.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Eligible payments</p>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="font-medium">All eligible SwiftPay outgoing payments</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Excludes savings deposits/withdrawals, internal transfers,
                  failed, reversed, refund, and system transactions.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Category filters (merchant, bills, online) can be added later
                without changing this default.
              </p>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Preview</p>
              <div className="space-y-2">
                {previews.map((row) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2 text-sm"
                    key={row.spend}
                  >
                    <span className="text-muted-foreground">
                      If you spend {row.spend}
                    </span>
                    <span className="font-medium">You save {row.save}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
                Paying $100 with 5% Spend&Save requires $105 available. The
                merchant receives $100; ${" "}
                {formatMoneyShort(
                  formatUnitsToDecimal(
                    calculateSaveAmountUnits(
                      100n * 10n ** 6n,
                      percentage,
                    ),
                    6,
                  ),
                )}{" "}
                goes to your pocket. Payment is blocked if you only have the
                payment amount.
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              disabled={isSaving || step === 1}
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
              type="button"
              variant="ghost"
            >
              Back
            </Button>
            <div className="flex gap-2">
              <Button
                disabled={isSaving}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              {step < 4 ? (
                <Button
                  disabled={step === 1 && !pocketId}
                  onClick={() =>
                    setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))
                  }
                  type="button"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  disabled={isSaving || !pocketId}
                  onClick={() => void handleActivate()}
                  type="button"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Activating…
                    </>
                  ) : (
                    "Activate Spend&Save"
                  )}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatePocketDialog
        circleSocialUuid={circleSocialUuid}
        onCreated={(pocket) => {
          onPocketsChange([pocket, ...pockets]);
          setPocketId(pocket.id);
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
        ownerWallet={ownerWallet}
      />
    </>
  );
}
