"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SendStepIndicator } from "@/components/dashboard/send-step-indicator";
import { TokenSelect } from "@/components/design/token-select";
import {
  RecurringScheduleFields,
  RecurringToggle,
  type RecurringScheduleDraft,
} from "@/components/recurring-schedule-fields";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import type { ArcTokenSymbol } from "@/lib/tokens";

export type SendSettlementQuote = {
  feeAmount: string;
  feeLabel: string;
  saveAmount?: string;
  saveLabel?: string;
  totalRequired: string;
};

export type SendPaymentWizardProps = {
  address?: string;
  authWallet: string | null;
  beneficiaryError: string | null;
  beneficiaryName: string;
  beneficiaryStatus: string | null;
  canSaveBeneficiary: boolean;
  canSubmitPayment: boolean;
  isAuthenticatingWallet: boolean;
  isBeneficiarySaving: boolean;
  isCirclePaymentPending: boolean;
  isConfirming: boolean;
  isConnected: boolean;
  isEmbeddedWalletMode: boolean;
  isRecipientResolving: boolean;
  isRecipientValid: boolean;
  isSubmitting: boolean;
  isSwitchingChain: boolean;
  isWalletAuthenticated: boolean;
  isWritePending: boolean;
  onBeneficiaryNameChange: (value: string) => void;
  onPaymentAmountChange: (value: string) => void;
  onPaymentNarrationChange: (value: string) => void;
  onRecipientChange: (value: string) => void;
  onSaveBeneficiary: () => void;
  onSelectToken: (token: ArcTokenSymbol) => void;
  onSubmit: () => void;
  onWalletSignIn: () => void;
  paymentAmount: string;
  paymentAmountUnits: bigint | null;
  paymentError: string | null;
  onRecurringChange: (value: RecurringScheduleDraft) => void;
  onRecurringEnabledChange: (value: boolean) => void;
  paymentNarration: string;
  paymentStatus: string;
  spendSaveNotice?: string | null;
  primaryButtonText: string;
  recurring: RecurringScheduleDraft;
  recurringEnabled: boolean;
  receiveHref: string;
  recipientAddress: string;
  recipientDisplayLabel: string;
  recipientResolveError: string | null;
  resolvedRecipientUsername: string | null;
  refreshBalances: () => void;
  selectedToken: ArcTokenSymbol;
  settlementQuote?: SendSettlementQuote | null;
  shortenAddress: (value?: string) => string;
  transactionConfirmed: boolean;
  transactionExplorerUrl?: string;
  trimmedPaymentNarration: string;
  trimmedRecipientAddress: string;
  walletAddress: string;
};

function PaymentRouteViz({ from, to }: { from: string; to: string }) {
  return (
    <div className="payment-route-viz">
      <div className="route-node">{from}</div>
      <div className="route-line" />
      <div className="route-node">Arc</div>
      <div className="route-line" />
      <div className="route-node">{to}</div>
    </div>
  );
}

export function SendPaymentWizard(props: SendPaymentWizardProps) {
  const {
    address,
    authWallet,
    beneficiaryError,
    beneficiaryName,
    beneficiaryStatus,
    canSaveBeneficiary,
    canSubmitPayment,
    isAuthenticatingWallet,
    isBeneficiarySaving,
    isCirclePaymentPending,
    isConfirming,
    isConnected,
    isEmbeddedWalletMode,
    isRecipientResolving,
    isRecipientValid,
    isSubmitting,
    isSwitchingChain,
    isWalletAuthenticated,
    isWritePending,
    onBeneficiaryNameChange,
    onPaymentAmountChange,
    onPaymentNarrationChange,
    onRecipientChange,
    onSaveBeneficiary,
    onSelectToken,
    onSubmit,
    onWalletSignIn,
    onRecurringChange,
    onRecurringEnabledChange,
    paymentAmount,
    paymentError,
    paymentNarration,
    paymentStatus,
    spendSaveNotice,
    primaryButtonText,
    receiveHref,
    recipientAddress,
    recurring,
    recurringEnabled,
    recipientResolveError,
    resolvedRecipientUsername,
    refreshBalances,
    selectedToken,
    settlementQuote,
    shortenAddress,
    transactionConfirmed,
    transactionExplorerUrl,
    trimmedPaymentNarration,
    trimmedRecipientAddress,
    walletAddress,
  } = props;

  const hasAmount =
    props.paymentAmountUnits !== null && props.paymentAmountUnits > BigInt(0);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Local draft fields so typing does not thrash the whole dashboard tree.
  const [localRecipient, setLocalRecipient] = useState(recipientAddress);
  const [localAmount, setLocalAmount] = useState(paymentAmount);
  const [localNarration, setLocalNarration] = useState(paymentNarration);
  const recipientSyncTimer = useRef<number | null>(null);
  const amountSyncTimer = useRef<number | null>(null);
  const narrationSyncTimer = useRef<number | null>(null);
  const lastExternalRecipient = useRef(recipientAddress);
  const lastExternalAmount = useRef(paymentAmount);
  const lastExternalNarration = useRef(paymentNarration);

  // Pull in external updates (URL prefill, beneficiary pick) without fighting keystrokes.
  useEffect(() => {
    if (recipientAddress !== lastExternalRecipient.current) {
      lastExternalRecipient.current = recipientAddress;
      setLocalRecipient(recipientAddress);
    }
  }, [recipientAddress]);

  useEffect(() => {
    if (paymentAmount !== lastExternalAmount.current) {
      lastExternalAmount.current = paymentAmount;
      setLocalAmount(paymentAmount);
    }
  }, [paymentAmount]);

  useEffect(() => {
    if (paymentNarration !== lastExternalNarration.current) {
      lastExternalNarration.current = paymentNarration;
      setLocalNarration(paymentNarration);
    }
  }, [paymentNarration]);

  useEffect(() => {
    return () => {
      if (recipientSyncTimer.current !== null) {
        window.clearTimeout(recipientSyncTimer.current);
      }
      if (amountSyncTimer.current !== null) {
        window.clearTimeout(amountSyncTimer.current);
      }
      if (narrationSyncTimer.current !== null) {
        window.clearTimeout(narrationSyncTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!(isSubmitting || transactionConfirmed)) {
      return;
    }
    setStepWithoutJump(4);
  }, [isSubmitting, transactionConfirmed]);

  function scheduleRecipientSync(value: string) {
    setLocalRecipient(value);
    if (recipientSyncTimer.current !== null) {
      window.clearTimeout(recipientSyncTimer.current);
    }
    recipientSyncTimer.current = window.setTimeout(() => {
      lastExternalRecipient.current = value;
      onRecipientChange(value);
    }, 150);
  }

  function scheduleAmountSync(value: string) {
    setLocalAmount(value);
    if (amountSyncTimer.current !== null) {
      window.clearTimeout(amountSyncTimer.current);
    }
    amountSyncTimer.current = window.setTimeout(() => {
      lastExternalAmount.current = value;
      onPaymentAmountChange(value);
    }, 150);
  }

  function scheduleNarrationSync(value: string) {
    setLocalNarration(value);
    if (narrationSyncTimer.current !== null) {
      window.clearTimeout(narrationSyncTimer.current);
    }
    narrationSyncTimer.current = window.setTimeout(() => {
      lastExternalNarration.current = value;
      onPaymentNarrationChange(value);
    }, 150);
  }

  function flushDrafts() {
    if (recipientSyncTimer.current !== null) {
      window.clearTimeout(recipientSyncTimer.current);
      recipientSyncTimer.current = null;
    }
    if (amountSyncTimer.current !== null) {
      window.clearTimeout(amountSyncTimer.current);
      amountSyncTimer.current = null;
    }
    if (narrationSyncTimer.current !== null) {
      window.clearTimeout(narrationSyncTimer.current);
      narrationSyncTimer.current = null;
    }
    lastExternalRecipient.current = localRecipient;
    lastExternalAmount.current = localAmount;
    lastExternalNarration.current = localNarration;
    onRecipientChange(localRecipient);
    onPaymentAmountChange(localAmount);
    onPaymentNarrationChange(localNarration);
  }

  function setStepWithoutJump(next: 1 | 2 | 3 | 4) {
    const y = typeof window === "undefined" ? 0 : window.scrollY;
    setStep(next);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
    });
  }

  function goNext() {
    flushDrafts();
    if (step === 1 && isRecipientValid) setStepWithoutJump(2);
    else if (step === 2 && hasAmount) setStepWithoutJump(3);
    else if (step === 3) setStepWithoutJump(4);
  }

  function goBack() {
    if (step > 1 && step < 4) {
      setStepWithoutJump((step - 1) as 1 | 2 | 3 | 4);
    }
  }

  const isBusy =
    isWritePending ||
    isConfirming ||
    isCirclePaymentPending ||
    isSwitchingChain ||
    isSubmitting;

  return (
    <div className="send-wizard min-w-0">
      <div className="mb-5 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-eyebrow">Pay</p>
          <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            Pay
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            One wallet confirmation settles the payment, platform fee, and
            Spend&Save when it is on.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            onClick={refreshBalances}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
          </Button>
          <Button asChild variant="outline">
            <Link href={receiveHref}>
              <Wallet className="h-4 w-4" />
              Receive
            </Link>
          </Button>
        </div>
      </div>

      <SendStepIndicator activeStep={step} className="mb-6" />

      <form
        className="send-wizard-body min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 3) {
            goNext();
            return;
          }
          flushDrafts();
          onSubmit();
        }}
      >
        <div className="send-wizard-panes">
        <div
          aria-hidden={step !== 1}
          className="send-wizard-pane grid gap-4"
          data-active={step === 1 ? "true" : "false"}
          data-step="1"
        >
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-foreground">
                Recipient wallet or @username
              </span>
              <div className="field-shell flex h-11 items-center gap-2 px-3">
                <Wallet className="h-4 w-4 text-primary" />
                <input
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  onChange={(event) => scheduleRecipientSync(event.target.value)}
                  placeholder="0x address or @username"
                  spellCheck={false}
                  value={localRecipient}
                />
                {isRecipientResolving ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : null}
              </div>
              {recipientResolveError ? (
                <p className="text-sm text-destructive">{recipientResolveError}</p>
              ) : isRecipientValid && resolvedRecipientUsername ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Resolved to @{resolvedRecipientUsername}
                </p>
              ) : null}
            </label>

            <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Beneficiary name
                  </span>
                  <div className="field-shell flex h-11 items-center gap-2 px-3">
                    <Users className="h-4 w-4 text-primary" />
                    <input
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      maxLength={80}
                      onChange={(event) =>
                        onBeneficiaryNameChange(event.target.value)
                      }
                      placeholder="Name this wallet"
                      value={beneficiaryName}
                    />
                  </div>
                </label>
                <Button
                  className="w-full sm:w-auto"
                  disabled={!canSaveBeneficiary}
                  onClick={onSaveBeneficiary}
                  type="button"
                  variant="outline"
                >
                  {isBeneficiarySaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Save beneficiary
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  {isWalletAuthenticated ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <span className="truncate text-muted-foreground">
                    {isEmbeddedWalletMode
                      ? `Circle wallet: ${shortenAddress(walletAddress)}`
                      : isWalletAuthenticated
                        ? `Session: ${shortenAddress(authWallet ?? undefined)}`
                        : isConnected
                          ? "Wallet session required"
                          : "Connect wallet"}
                  </span>
                </div>
                {isConnected && !isWalletAuthenticated && !isEmbeddedWalletMode ? (
                  <Button
                    disabled={isAuthenticatingWallet}
                    onClick={onWalletSignIn}
                    size="sm"
                    type="button"
                  >
                    {isAuthenticatingWallet ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Sign in
                  </Button>
                ) : null}
              </div>

              {beneficiaryError ? (
                <p className="mt-2 text-sm text-destructive">{beneficiaryError}</p>
              ) : beneficiaryStatus ? (
                <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                  {beneficiaryStatus}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Saved contacts live in the list beside this board.
                </p>
              )}
            </div>
        </div>

        <div
          aria-hidden={step !== 2}
          className="send-wizard-pane grid gap-4"
          data-active={step === 2 ? "true" : "false"}
          data-step="2"
        >
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">Amount</span>
                <div className="field-shell flex h-11 items-center gap-2 px-3">
                  <TokenIcon className="h-5 w-5 rounded-full" symbol={selectedToken} />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    inputMode="decimal"
                    onChange={(event) => scheduleAmountSync(event.target.value)}
                    placeholder="0.00"
                    value={localAmount}
                  />
                </div>
              </label>
              <TokenSelect
                label="Asset"
                onChange={onSelectToken}
                size="sm"
                value={selectedToken}
              />
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-foreground">
                Narration <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <div className="field-shell p-3">
                <textarea
                  className="min-h-20 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
                  maxLength={140}
                  onChange={(event) => scheduleNarrationSync(event.target.value)}
                  placeholder="What is this payment for?"
                  value={localNarration}
                />
              </div>
            </label>

            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground">
              <p>
                Platform fee: {settlementQuote?.feeLabel ?? "0.1%"} on this send.
                {settlementQuote?.saveLabel
                  ? ` ${settlementQuote.saveLabel}`
                  : ""}
              </p>
              {settlementQuote?.totalRequired ? (
                <p className="mt-1 font-medium text-foreground">
                  Total debit: {settlementQuote.totalRequired} {selectedToken}
                </p>
              ) : (
                <p className="mt-1">Gas is USDC-native on Arc Testnet.</p>
              )}
            </div>
        </div>

        <div
          aria-hidden={step !== 3}
          className="send-wizard-pane grid gap-4"
          data-active={step === 3 ? "true" : "false"}
          data-step="3"
        >
            <PaymentRouteViz
              from={shortenAddress(address)}
              to={
                isRecipientValid
                  ? resolvedRecipientUsername
                    ? `@${resolvedRecipientUsername}`
                    : shortenAddress(trimmedRecipientAddress)
                  : "Recipient"
              }
            />

            <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:p-4">
              {[
                ["From", shortenAddress(address)],
                [
                  "To",
                  isRecipientValid
                    ? resolvedRecipientUsername
                      ? `@${resolvedRecipientUsername}`
                      : shortenAddress(trimmedRecipientAddress)
                    : "n/a",
                ],
                ["Amount", `${paymentAmount || "0.00"} ${selectedToken}`],
                [
                  "Platform fee",
                  settlementQuote
                    ? `${settlementQuote.feeAmount} ${selectedToken}`
                    : "0.1%",
                ],
                ...(settlementQuote?.saveAmount
                  ? ([
                      [
                        "Spend&Save",
                        `${settlementQuote.saveAmount} ${selectedToken}`,
                      ],
                    ] as const)
                  : []),
                ...(settlementQuote?.totalRequired
                  ? ([
                      [
                        "Total debit",
                        `${settlementQuote.totalRequired} ${selectedToken}`,
                      ],
                    ] as const)
                  : []),
                ["Narration", trimmedPaymentNarration || "No note"],
              ].map(([label, value]) => (
                <div
                  className="flex min-w-0 items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0"
                  key={label}
                >
                  <span className="shrink-0 text-muted-foreground">{label}</span>
                  <span className="min-w-0 break-words text-right font-medium">{value}</span>
                </div>
              ))}
            </div>

            <RecurringToggle
              checked={recurringEnabled}
              onCheckedChange={onRecurringEnabledChange}
            />
            {recurringEnabled ? (
              <RecurringScheduleFields
                onChange={onRecurringChange}
                value={recurring}
              />
            ) : null}
        </div>

        <div
          aria-hidden={step !== 4}
          className="send-wizard-pane gap-4 text-center"
          data-active={step === 4 ? "true" : "false"}
          data-step="4"
        >
            {transactionConfirmed ? (
              <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
            ) : paymentError ? (
              <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            ) : (
              <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <div>
              <p className="font-heading text-lg font-semibold">
                {transactionConfirmed
                  ? "Payment confirmed"
                  : paymentError
                    ? "Payment did not finish"
                    : "Processing payment"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {paymentAmount
                  ? `${paymentAmount} ${selectedToken} ${
                      transactionConfirmed ? "sent" : "sending"
                    }`
                  : paymentStatus}
              </p>
              {spendSaveNotice ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {spendSaveNotice}
                </p>
              ) : null}
            </div>
            {transactionExplorerUrl ? (
              <a
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary"
                href={transactionExplorerUrl}
                rel="noreferrer"
                target="_blank"
              >
                View on ArcScan
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {transactionConfirmed ? (
              <Button
                className="w-full whitespace-normal sm:w-auto sm:whitespace-nowrap"
                onClick={() => setStepWithoutJump(1)}
                type="button"
                variant="outline"
              >
                Send another payment
              </Button>
            ) : null}
        </div>
        </div>

        {paymentError ? (
          <div className="mt-4 flex min-w-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{paymentError}</span>
          </div>
        ) : null}

        <div
          className="send-wizard-actions"
          data-hidden={step >= 4 && !paymentError ? "true" : "false"}
        >
            <Button
              className={step === 1 ? "invisible" : undefined}
              disabled={step <= 1 || (step >= 4 && !paymentError)}
              onClick={() => {
                if (step >= 4) {
                  setStepWithoutJump(3);
                  return;
                }
                goBack();
              }}
              tabIndex={step <= 1 || (step >= 4 && !paymentError) ? -1 : undefined}
              type="button"
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              className="min-w-0 flex-1 whitespace-normal sm:ml-auto sm:flex-none sm:whitespace-nowrap"
              disabled={
                step >= 4 && !paymentError
                  ? true
                  : step === 1
                    ? !isRecipientValid && localRecipient.trim().length === 0
                    : step === 2
                      ? !hasAmount && localAmount.trim().length === 0
                      : isBusy || (isConnected && !canSubmitPayment)
              }
              tabIndex={step >= 4 && !paymentError ? -1 : undefined}
              type="submit"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === 3 ? (
                <ArrowRight className="h-4 w-4" />
              ) : null}
              {step === 3 || (step >= 4 && paymentError)
                ? isBusy
                  ? "Confirming"
                  : primaryButtonText
                : "Continue"}
            </Button>
        </div>
      </form>
    </div>
  );
}
