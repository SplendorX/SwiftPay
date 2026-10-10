"use client";

import { ArrowDownLeft, CheckCircle2, Clock3, ExternalLink, PauseCircle, RefreshCw, XCircle } from "lucide-react";

import type { IncomingDepositView } from "@/lib/multichain/client";
import { cn } from "@/lib/utils";

import "./multichain.css";

const statusCopy: Record<IncomingDepositView["status"], string> = {
  arriving: "Arriving",
  "below-min": "Waiting for the minimum",
  credited: "Added to your balance",
  failed: "Failed on its network",
  "on-hold": "On hold, our team is checking it",
  retrying: "Retrying",
};

function amountLabel(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 2 })
    : value;
}

function StatusIcon({ status }: { status: IncomingDepositView["status"] }) {
  switch (status) {
    case "credited":
      return <CheckCircle2 className="h-4 w-4" />;
    case "failed":
      return <XCircle className="h-4 w-4" />;
    case "on-hold":
      return <PauseCircle className="h-4 w-4" />;
    case "retrying":
      return <RefreshCw className="h-4 w-4" />;
    case "below-min":
      return <Clock3 className="h-4 w-4" />;
    default:
      return <ArrowDownLeft className="h-4 w-4" />;
  }
}

/** USDC on its way in from other networks, newest first. */
export function IncomingDeposits({
  deposits,
  minDepositByNetwork,
}: {
  deposits: IncomingDepositView[];
  minDepositByNetwork?: Record<string, number>;
}) {
  if (deposits.length === 0) return null;

  return (
    <ul className="mc-incoming">
      {deposits.map((deposit) => {
        const min = minDepositByNetwork?.[deposit.network];
        return (
          <li className={cn("mc-incoming-row", `is-${deposit.status}`)} key={deposit.id}>
            <span className="mc-incoming-icon">
              <StatusIcon status={deposit.status} />
            </span>
            <span className="mc-incoming-main">
              <span className="mc-incoming-title">
                {deposit.status === "credited" ? "" : "+"}
                {amountLabel(deposit.amount)} USDC from {deposit.sender ? `${deposit.sender} on ` : ""}
                {deposit.networkName}
              </span>
              <span className="mc-incoming-sub">
                {statusCopy[deposit.status]}
                {deposit.status === "below-min" && min
                  ? ` (${min} USDC). It moves once the total on ${deposit.networkName} reaches it.`
                  : ""}
                {deposit.status === "credited" && deposit.amountCredited
                  ? ` · ${amountLabel(deposit.amountCredited)} after network fee`
                  : ""}
              </span>
            </span>
            <a
              aria-label="View on the network's explorer"
              className="mc-incoming-link"
              href={deposit.sourceTxUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
