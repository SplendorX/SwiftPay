"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  ShieldAlert,
} from "lucide-react";

import { AllieMark } from "@/components/allie/AllieMark";
import { ProTierBadge, isProTier } from "@/components/allie/ProTierBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  explorerTxUrl,
  shortenAddress,
  unitsToDisplay,
  type AllieChatResponse,
  type AllieExecutionResponse,
} from "@/lib/allie/client";
import { cn } from "@/lib/utils";

const railLabels: Record<string, string> = {
  "arc-native": "Arc native",
  "agent-direct": "Agent Wallet (Arc)",
  batch: "BulkPay",
  recurring: "RecurePay",
  cctp: "CCTP bridge",
  "not-yet-available": "Unavailable",
};

function formatSeconds(seconds?: number) {
  if (!seconds) {
    return "—";
  }

  if (seconds < 60) {
    return `~${seconds}s`;
  }

  return `~${Math.round(seconds / 60)} min`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-semibold">{value}</span>
    </div>
  );
}

export type ActionCardState =
  | "idle"
  | "executing"
  | "settled"
  | "error"
  | "cancelled";

export function ActionCard({
  busy,
  execution,
  executionError,
  onCancel,
  onConfirm,
  response,
  state,
}: {
  busy?: boolean;
  execution?: AllieExecutionResponse | null;
  executionError?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  response: AllieChatResponse;
  state: ActionCardState;
}) {
  if (
    response.action.type !== "PaymentIntent" &&
    response.action.type !== "BatchPay"
  ) {
    return null;
  }

  const { action } = response;
  const legs = response.legs ?? [];
  const isBatch = action.type === "BatchPay";
  const blocked = !response.allowed;
  const txHash = execution?.result.txHash;
  const explorerUrl = txHash ? explorerTxUrl(txHash) : "";
  // `submitted` counts payments only — fee transfers ride along as extra legs
  // and must not inflate the denominator, or a clean single send reports
  // "1 of 2 submitted".
  const paymentLegCount =
    execution?.batch?.legs.filter((leg) => leg.kind === "payment").length ?? 0;

  return (
    <div
      className={cn(
        "w-full max-w-[min(34rem,85%)] rounded-2xl border bg-card p-4 shadow-sm transition-opacity",
        blocked ? "border-destructive/40" : "border-border",
        state === "cancelled" && "opacity-60",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <AllieMark size={18} />
        <p className="text-sm font-semibold">
          {blocked
            ? "Payment blocked"
            : isBatch
              ? `Confirm ${legs.length} payments`
              : "Confirm this payment"}
        </p>
        {isProTier(response.tier) ? (
          <ProTierBadge
            className="ml-auto"
            overagePoints={response.overagePoints}
          />
        ) : (
          <Badge className="ml-auto" variant="outline">
            Tier {response.tier}
          </Badge>
        )}
      </div>

      {response.requiresApproval && !blocked && state === "idle" ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Above your auto-approve threshold — confirming here opens one more
            explicit go-ahead before anything moves.
          </span>
        </div>
      ) : null}

      {blocked ? (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{response.reason ?? "Your policy blocked this payment."}</span>
        </div>
      ) : null}

      <div className="grid gap-2 rounded-xl border border-border bg-background p-3">
        {isBatch ? (
          <div className="grid gap-1.5 border-b border-border pb-2">
            {legs.map((leg, index) => (
              <div
                className="flex items-baseline justify-between gap-3 text-sm"
                key={`${index}-${leg.address}`}
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {leg.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {unitsToDisplay(leg.amountUnits)} {action.asset}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <Row
              label="Recipient"
              value={
                response.recipientLabel ??
                (response.resolvedRecipient
                  ? shortenAddress(response.resolvedRecipient)
                  : action.recipient)
              }
            />
            {response.resolvedRecipient &&
            response.recipientLabel !== response.resolvedRecipient ? (
              <Row
                label="Address"
                value={shortenAddress(response.resolvedRecipient)}
              />
            ) : null}
          </>
        )}
        <Row
          label={isBatch ? "Total" : "Amount"}
          value={`${
            response.amountUnits ? unitsToDisplay(response.amountUnits) : "—"
          } ${action.asset}`}
        />
        <Row label="Rail" value={railLabels[response.rail ?? ""] ?? "—"} />

        {(response.fees?.fees ?? []).map((fee) => (
          <Row
            key={fee.kind}
            label={fee.label}
            value={`${unitsToDisplay(fee.units)} ${action.asset}`}
          />
        ))}

        {response.totalDebitUnits ? (
          <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
            <span className="font-medium">Total from your Agent Wallet</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {unitsToDisplay(response.totalDebitUnits)} {action.asset}
            </span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Estimated time</span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {formatSeconds(response.estimatedSeconds)}
          </span>
        </div>
        {action.note ? <Row label="Note" value={action.note} /> : null}
      </div>

      {state === "settled" && execution ? (
        <div className="mt-3 min-w-0 overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {execution.batch && paymentLegCount > 1
              ? `${execution.batch.submitted} of ${paymentLegCount} payments submitted to Arc`
              : "Submitted to Arc"}
          </p>
          {txHash ? (
            explorerUrl ? (
              <a
                className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-primary underline-offset-4 hover:underline"
                href={explorerUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                {shortenAddress(txHash)}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            ) : (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {shortenAddress(txHash)}
              </p>
            )
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Awaiting a transaction hash from Circle.
            </p>
          )}
        </div>
      ) : null}

      {state === "cancelled" ? (
        <p className="mt-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          Cancelled — nothing was sent. Ask again if you want to retry.
        </p>
      ) : null}

      {state === "error" && executionError ? (
        <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {executionError}
        </p>
      ) : null}

      {blocked || state === "settled" || state === "cancelled" ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="flex-1"
            disabled={busy || !response.intentId}
            onClick={onConfirm}
            type="button"
          >
            {busy
            ? "Paying…"
            : isBatch
              ? `Confirm & Pay ${legs.length}`
              : "Confirm & Pay"}
          </Button>
          <Button
            className="flex-1"
            disabled={busy}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
