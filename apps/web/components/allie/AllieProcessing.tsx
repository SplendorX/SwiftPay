"use client";

import { Check, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { AllieMark } from "@/components/allie/AllieMark";
import { cn } from "@/lib/utils";

import "./allie-processing.css";

/**
 * What ALLIE does after "Confirm & Pay", in order. The engine reports no
 * progress events, so the first two steps advance on a timer and the last
 * one stays open until the payment actually comes back: the panel never
 * says "done" before it is.
 */
const steps = [
  { label: "Checking your limits", after: 0 },
  { label: "Signing with your Agent Wallet", after: 900 },
  { label: "Submitting to Arc", after: 2100 },
] as const;

/** Shown in place of the buttons while a confirmed payment is executing. */
export function AllieProcessing({
  amountLabel,
  recipientLabel,
}: {
  amountLabel: string;
  recipientLabel: string;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timers = steps.slice(1).map((step, index) =>
      window.setTimeout(() => setActive(index + 1), step.after),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <div aria-live="polite" className="allie-proc" role="status">
      <div className="allie-proc-stage">
        <span className="allie-proc-avatar">
          <span aria-hidden className="allie-proc-ring" />
          <AllieMark className="allie-proc-mark" />
        </span>

        <div className="allie-proc-flow">
          <span className="allie-proc-end">
            <Wallet className="h-3.5 w-3.5" />
            Agent Wallet
          </span>
          <span aria-hidden className="allie-proc-track">
            <span className="allie-proc-packet" />
          </span>
          <span className="allie-proc-end is-to" title={recipientLabel}>
            {recipientLabel}
          </span>
        </div>
      </div>

      <p className="allie-proc-title">
        ALLIE is sending <strong>{amountLabel}</strong>
        <span aria-hidden className="allie-proc-dots">
          <span />
          <span />
          <span />
        </span>
      </p>

      <ol className="allie-proc-steps">
        {steps.map((step, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <li className={cn(done && "is-done", current && "is-current")} key={step.label}>
              <span className="allie-proc-step-icon">{done ? <Check className="h-3 w-3" /> : null}</span>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A check that draws itself when the payment lands. */
export function AllieSettledCheck() {
  return (
    <span aria-hidden className="allie-settled-check">
      <svg fill="none" viewBox="0 0 24 24">
        <circle className="allie-settled-circle" cx="12" cy="12" r="10.5" />
        <path className="allie-settled-tick" d="M7.2 12.4l3.1 3.1 6.5-6.7" />
      </svg>
    </span>
  );
}
