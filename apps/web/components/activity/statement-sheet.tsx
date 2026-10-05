"use client";

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetGrabber,
  SheetTitle,
} from "@/components/ui/sheet";
import { downloadStatement, fetchStatement, type StatementFormat } from "@/lib/activity/statement";
import { useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

type Preset = "30d" | "3m" | "12m" | "year" | "custom";

/** A calendar day as YYYY-MM-DD in the viewer's own time zone. */
function dayString(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function presetRange(preset: Exclude<Preset, "custom">) {
  const today = new Date();
  const start = new Date(today);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  if (preset === "3m") start.setMonth(start.getMonth() - 3);
  if (preset === "12m") start.setFullYear(start.getFullYear() - 1);
  if (preset === "year") start.setMonth(0, 1);
  return { from: dayString(start), to: dayString(today) };
}

const presets: Array<{ id: Preset; label: string }> = [
  { id: "30d", label: "Last 30 days" },
  { id: "3m", label: "Last 3 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

/**
 * Download a statement of account for any period. The Activity page shows
 * the last 30 days; everything older is available here.
 */
export function StatementSheet({
  onOpenChange,
  open,
  ownerWallet,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  ownerWallet?: string | null;
}) {
  const side = useSheetSide();
  const [preset, setPreset] = useState<Preset>("3m");
  const [custom, setCustom] = useState(() => presetRange("3m"));
  const [format, setFormat] = useState<StatementFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = dayString(new Date());

  const range = useMemo(() => (preset === "custom" ? custom : presetRange(preset)), [custom, preset]);
  const invalid = !range.from || !range.to || range.from > range.to || range.to > today;

  async function download() {
    if (!ownerWallet || invalid) return;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchStatement(ownerWallet, range);
      await downloadStatement(data, format);
      toast.success(
        data.items.length > 0
          ? `Statement downloaded (${data.items.length} ${data.items.length === 1 ? "transaction" : "transactions"})`
          : "Statement downloaded. There was no activity in this period.",
      );
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The statement couldn't be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={cn(
          "w-full gap-0 p-0 sm:max-w-md",
          side === "bottom" && "max-h-[92dvh] rounded-t-[1.75rem] border-t-0 sm:max-w-none",
        )}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="overflow-y-auto px-5 pb-6 pt-7">
          <SheetTitle className="font-heading text-xl font-semibold">Statement of account</SheetTitle>
          <SheetDescription className="mt-1">
            Activity shows the last 30 days. Download a statement for any period, including older
            activity.
          </SheetDescription>

          <div className="mt-5 flex flex-wrap gap-2">
            {presets.map((option) => (
              <button
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  preset === option.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
                key={option.id}
                onClick={() => {
                  if (option.id === "custom" && preset !== "custom") setCustom(range);
                  setPreset(option.id);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              From
              <Input
                className="h-11"
                max={range.to || today}
                onChange={(event) => {
                  setPreset("custom");
                  setCustom({ from: event.target.value, to: range.to });
                }}
                type="date"
                value={range.from}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              To
              <Input
                className="h-11"
                max={today}
                min={range.from}
                onChange={(event) => {
                  setPreset("custom");
                  setCustom({ from: range.from, to: event.target.value });
                }}
                type="date"
                value={range.to}
              />
            </label>
          </div>
          {invalid ? (
            <p className="mt-2 text-sm text-destructive">
              Pick a start date on or before the end date, and no later than today.
            </p>
          ) : null}

          <p className="mt-5 text-sm font-medium">Format</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                { hint: "To keep or share", icon: FileText, id: "pdf", label: "PDF" },
                { hint: "For spreadsheets", icon: FileSpreadsheet, id: "csv", label: "CSV" },
              ] as const
            ).map((option) => (
              <button
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                  format === option.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                )}
                key={option.id}
                onClick={() => setFormat(option.id)}
                type="button"
              >
                <option.icon className={cn("h-5 w-5", format === option.id ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          <Button
            className="mt-6 h-12 w-full text-base"
            disabled={busy || invalid || !ownerWallet}
            onClick={() => void download()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Preparing statement…" : "Download statement"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
