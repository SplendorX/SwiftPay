"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const steps = [
  { id: 1, label: "Recipient" },
  { id: 2, label: "Amount" },
  { id: 3, label: "Review" },
  { id: 4, label: "Confirm" },
] as const;

type SendStepIndicatorProps = {
  activeStep: 1 | 2 | 3 | 4;
  className?: string;
};

export function SendStepIndicator({ activeStep, className }: SendStepIndicatorProps) {
  return (
    <div className={cn("send-steps", className)}>
      {steps.map((step) => {
        const isActive = step.id === activeStep;
        const isDone = step.id < activeStep;

        return (
          <div
            className={cn(
              "send-step",
              isActive && "send-step-active",
              isDone && "send-step-done",
            )}
            key={step.id}
          >
            <span className="send-step-dot">
              {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
            </span>
            <span className="send-step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function deriveSendStep({
  hasAmount,
  hasRecipient,
  isConfirmed,
  isSubmitting,
}: {
  hasAmount: boolean;
  hasRecipient: boolean;
  isConfirmed: boolean;
  isSubmitting: boolean;
}): 1 | 2 | 3 | 4 {
  if (isConfirmed || isSubmitting) {
    return 4;
  }
  if (hasRecipient && hasAmount) {
    return 3;
  }
  if (hasRecipient) {
    return 2;
  }
  return 1;
}