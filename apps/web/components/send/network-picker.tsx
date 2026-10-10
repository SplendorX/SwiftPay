"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import type { NetworkFeeView } from "@/lib/multichain/client";
import { useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import "./network-picker.css";

/** What the picker needs of a network. */
type PickerNetwork = { key: string; name: string };

export function NetworkLogo({ chain, className }: { chain: PickerNetwork; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className={cn("xc-logo", className)} height={32} src={`/networks/${chain.key}.png`} width={32} />
  );
}

/** "$0.06 fee", "$0.06 + 0.01%", or "No fee". */
export function networkFeeLabel(fee: NetworkFeeView | undefined) {
  if (!fee) return null;
  const flat = Number(fee.flatFee);
  const percent = fee.fastFeeBps > 0 ? `${Number((fee.fastFeeBps / 100).toFixed(4))}%` : null;
  if (flat <= 0) return percent ? `${percent} fee` : "No fee";
  // Rounded up to the cent, so the picker never shows less than the send costs.
  const dollars = `$${(Math.ceil(flat * 100) / 100).toFixed(2)}`;
  return percent ? `${dollars} + ${percent}` : `${dollars} fee`;
}

/**
 * The chosen network as a row; tapping it slides up the full list. Each row's
 * second line is `detail`, or the live send fee when `fees` is given.
 */
export function NetworkPicker<T extends PickerNetwork>({
  chains,
  description = "Fees are Circle’s, taken from the amount sent.",
  detail,
  fees,
  onChange,
  value,
}: {
  chains: readonly T[];
  description?: string;
  detail?: (chain: T) => ReactNode;
  /** Live fees by network key, once loaded. */
  fees?: Record<string, NetworkFeeView> | null;
  onChange: (chain: T) => void;
  value: T | null;
}) {
  const [open, setOpen] = useState(false);
  const side = useSheetSide();
  const subline = (chain: T) =>
    detail ? <span className="xc-picker-fee">{detail(chain)}</span> : <FeeLine fee={fees?.[chain.key]} loading={!fees} />;


  return (
    <>
      <button
        aria-haspopup="dialog"
        className="xc-picker"
        onClick={() => setOpen(true)}
        type="button"
      >
        {value ? <NetworkLogo chain={value} /> : <span className="xc-logo is-empty" />}
        <span className="xc-picker-text">
          <span className="xc-picker-name">{value?.name ?? "Choose a network"}</span>
          {value ? subline(value) : null}
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 opacity-60" />
      </button>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className={cn(
            "gap-0 p-0",
            side === "bottom" ? "max-h-[85dvh] rounded-t-[1.75rem] border-t-0" : "w-full sm:max-w-md",
          )}
          showCloseButton={false}
          side={side}
        >
          {side === "bottom" ? <SheetGrabber /> : null}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
            <SheetTitle className="text-center text-lg font-bold">Choose network</SheetTitle>
            <SheetDescription className="text-center text-sm text-muted-foreground">
              {description}
            </SheetDescription>
            <div className="xc-options" role="listbox" aria-label="Networks">
              {chains.map((chain) => {
                const selected = chain.key === value?.key;
                return (
                  <button
                    aria-selected={selected}
                    className={cn("xc-option", selected && "is-active")}
                    key={chain.key}
                    onClick={() => {
                      onChange(chain);
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <NetworkLogo chain={chain} />
                    <span className="xc-picker-text">
                      <span className="xc-picker-name">{chain.name}</span>
                      {subline(chain)}
                    </span>
                    {selected ? <Check className="h-5 w-5 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function FeeLine({ fee, loading }: { fee: NetworkFeeView | undefined; loading: boolean }) {
  const label = networkFeeLabel(fee);
  return (
    <span className="xc-picker-fee">
      {label ?? (loading ? <span className="xc-fee-skeleton" /> : "Fee shown at the next step")}
    </span>
  );
}
