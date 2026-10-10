"use client";

import { arcChain } from "@/lib/chains";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SendStepIndicator } from "@/components/dashboard/send-step-indicator";
import { RecipientStatus } from "@/components/recipient-status";
import { TokenSelect } from "@/components/design/token-select";
import {
  RecurringScheduleFields,
  RecurringToggle,
  type RecurringScheduleDraft,
} from "@/components/recurring-schedule-fields";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { calculateTransactionCashback } from "@/lib/referral/cashback-service";
import { useConversionRates, usdPerUnit } from "@/lib/use-conversion-rates";
import type { ArcTokenSymbol } from "@/lib/tokens";

export type SendSettlementQuote = {
  feeAmount: string;
  feeLabel: string;
  saveAmount?: string;
  saveLabel?: string;
  /** The Spend&Save rate in percent, when it applies (e.g. "1.00"). */
  savePercent?: string;
  totalRequired: string;
};

export type SendPaymentWizardProps = {
  address?: string;
  authWallet: string | null;
  availableBalance?: string;
  availableBalances?: Array<{ symbol: ArcTokenSymbol; amount: string }>;
  hideBalance?: boolean;
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
  isTreasuryMismatch?: boolean;
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
  /** Set once a schedule was created alongside this payment. */
  recurringNotice?: string | null;
  receiveHref: string;
  onSwitchToTreasury?: () => void;
  recipientAddress: string;
  recipientDisplayLabel: string;
  recipientResolveError: string | null;
  resolvedRecipientUsername: string | null;
  refreshBalances: () => void | Promise<void>;
  isRefreshingBalances?: boolean;
  selectedToken: ArcTokenSymbol;
  settlementQuote?: SendSettlementQuote | null;
  shortenAddress: (value?: string) => string;
  transactionConfirmed: boolean;
  transactionExplorerUrl?: string;
  treasuryAddress?: string;
  trimmedPaymentNarration: string;
  trimmedRecipientAddress: string;
  walletAddress: string;
};

function PaymentRouteViz({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
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
    availableBalance,
    availableBalances,
    hideBalance = false,
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
    isTreasuryMismatch = false,
    onSwitchToTreasury,
    primaryButtonText,
    receiveHref,
    recipientAddress,
    recurring,
    recurringEnabled,
    recurringNotice,
    recipientResolveError,
    resolvedRecipientUsername,
    refreshBalances,
    isRefreshingBalances = false,
    selectedToken,
    settlementQuote,
    shortenAddress,
    transactionConfirmed,
    transactionExplorerUrl,
    treasuryAddress,
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

  // Cashback tiers are in USD; EURC is valued at the live rate.
  const { rates } = useConversionRates();
  const usdPerToken = selectedToken === "EURC" ? (usdPerUnit("EUR", rates) ?? 1) : 1;
  const cashbackCalculation = useMemo(
    () => calculateTransactionCashback(localAmount || paymentAmount, usdPerToken),
    [localAmount, paymentAmount, usdPerToken],
  );
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

  const balanceChips =
    availableBalances && availableBalances.length > 0
      ? availableBalances
      : availableBalance
        ? [{ amount: availableBalance, symbol: selectedToken }]
        : [];

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
            One wallet confirmation settles the payment, service fee, and
            Spend&Save when it is on.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            aria-label="Refresh balances"
            disabled={isRefreshingBalances}
            onClick={() => void refreshBalances()}
            size="icon"
            title="Refresh balances"
            type="button"
            variant="outline"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshingBalances ? "animate-spin" : ""}`}
            />
          </Button>
          <Button asChild variant="outline">
            <Link href={receiveHref}>
              <Wallet className="h-4 w-4" />
              Receive
            </Link>
          </Button>
        </div>
      </div>

      <SendStepIndicator
        activeStep={step}
        className="mb-6"
        isComplete={transactionConfirmed && !paymentError}
      />

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
            {isTreasuryMismatch && treasuryAddress ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Business Treasury Mismatch</span>
                  </div>
                  {onSwitchToTreasury ? (
                    <Button
                      className="h-7 px-2.5 text-xs border-amber-500/40 hover:bg-amber-500/20"
                      onClick={onSwitchToTreasury}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Switch in wallet
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 opacity-90">
                  Connected wallet ({shortenAddress(address)}) does not match the business treasury ({shortenAddress(treasuryAddress)}). Switch accounts in your wallet to pay with business funds.
                </p>
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-foreground">
                Recipient wallet or @username
              </span>
              <div className="field-shell flex h-11 items-center gap-2 px-3">
                <Wallet className="h-4 w-4 text-primary" />
                <input
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  aria-describedby="send-recipient-status"
                  onChange={(event) => scheduleRecipientSync(event.target.value)}
                  placeholder="0x address or @username"
                  spellCheck={false}
                  value={localRecipient}
                />
                {isRecipientResolving ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : null}
              </div>
              <RecipientStatus
                id="send-recipient-status"
                resolution={{
                  error: recipientResolveError,
                  isResolving: isRecipientResolving,
                  isValid: isRecipientValid,
                  // The dashboard passes the resolved wallet here once valid.
                  resolvedAddress: isRecipientValid ? trimmedRecipientAddress : null,
                  resolvedUsername: resolvedRecipientUsername,
                }}
              />
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
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <span className="text-sm font-semibold text-foreground">Amount</span>
                  {balanceChips.length > 0 ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                        Available
                      </span>
                      {balanceChips.map((chip) => {
                        const isSelected = chip.symbol === selectedToken;
                        // Tapping the selected chip fills the amount field, so
                        // while balances are hidden that would leak the figure
                        // the eye is meant to conceal. Switching asset is fine.
                        const fillsAmount = isSelected && !hideBalance;
                        return (
                          <button
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? "border-primary/40 bg-primary/10 text-foreground"
                                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            }`}
                            key={chip.symbol}
                            disabled={isSelected && hideBalance}
                            onClick={() =>
                              fillsAmount
                                ? scheduleAmountSync(chip.amount)
                                : isSelected
                                  ? undefined
                                  : onSelectToken(chip.symbol)
                            }
                            title={
                              hideBalance
                                ? "Balances hidden"
                                : isSelected
                                  ? `Send your full ${chip.symbol} balance`
                                  : `Pay in ${chip.symbol} instead`
                            }
                            type="button"
                          >
                            <TokenIcon
                              className="h-3.5 w-3.5 shrink-0 rounded-full"
                              symbol={chip.symbol}
                            />
                            <span className="font-semibold tabular-nums">
                              {hideBalance ? "••••" : Number(chip.amount).toFixed(2)}
                            </span>
                            <span className="opacity-70">{chip.symbol}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
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
                Service fee: {settlementQuote?.feeLabel ?? "0.1%"} on this send.
                {settlementQuote?.saveLabel
                  ? ` ${settlementQuote.saveLabel}`
                  : ""}
              </p>
              {settlementQuote?.totalRequired ? (
                <p className="mt-1 font-medium text-foreground">
                  Total debit: {settlementQuote.totalRequired} {selectedToken}
                </p>
              ) : (
                <p className="mt-1">Gas is USDC-native on {arcChain.name}.</p>
              )}
            </div>

            {/* General Platform Cashback Indicator */}
            <div
              className={`rounded-lg border p-3 text-xs leading-5 transition-all ${
                cashbackCalculation.eligible
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200"
                  : "border-primary/20 bg-primary/5 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Coins className="h-4 w-4 text-amber-500 shrink-0" />
                {cashbackCalculation.eligible ? (
                  <span>
                    Earn <strong>+{cashbackCalculation.points} OnePoints</strong> ({cashbackCalculation.usdcValue} USDC) cashback!
                  </span>
                ) : (
                  <span>General Cashback: Earn OnePoints on transactions worth $20 or more</span>
                )}
              </div>
              <p className="mt-1 text-[11px] opacity-90">
                {cashbackCalculation.eligible && cashbackCalculation.nextTier ? (
                  <>Send {cashbackCalculation.nextTier.needed} more {selectedToken} to earn <strong>+{cashbackCalculation.nextTier.points} OnePoints</strong>.</>
                ) : (
                  <>Platform cashback tiers: 1 pt ($20+), 5 pts ($100+), 20 pts ($500+), 50 pts ($1,000+).{selectedToken === "EURC" ? " EURC counts at the live euro rate." : ""}</>
                )}
              </p>
            </div>
        </div>

        <div
          aria-hidden={step !== 3}
          className="send-wizard-pane grid gap-4"
          data-active={step === 3 ? "true" : "false"}
          data-step="3"
        >
            <PaymentRouteViz
              from={
                isTreasuryMismatch
                  ? `${shortenAddress(address)} (Personal)`
                  : shortenAddress(address)
              }
              to={
                isRecipientValid
                  ? resolvedRecipientUsername
                    ? `@${resolvedRecipientUsername}`
                    : shortenAddress(trimmedRecipientAddress)
                  : "Recipient"
              }
            />

            {isTreasuryMismatch && treasuryAddress ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>Signing with Personal Wallet</span>
                  </div>
                  {onSwitchToTreasury ? (
                    <Button
                      className="h-7 px-2.5 text-xs border-amber-500/40 hover:bg-amber-500/20"
                      onClick={onSwitchToTreasury}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Switch in wallet
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 opacity-90">
                  You are connected as <strong>{shortenAddress(address)}</strong> (Personal), but this workspace&apos;s treasury is <strong>{shortenAddress(treasuryAddress)}</strong>. Confirming will deduct funds from your personal wallet, not business funds.
                </p>
              </div>
            ) : null}
            <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:p-4">
              {[
                [
                  "From (Signing wallet)",
                  isTreasuryMismatch
                    ? `${shortenAddress(address)} (Personal)`
                    : shortenAddress(address),
                ],
                ...(isTreasuryMismatch && treasuryAddress
                  ? [["Business treasury", shortenAddress(treasuryAddress)] as const]
                  : []),
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
                  "Service fee",
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
                ...(cashbackCalculation.eligible
                  ? ([
                      [
                        "Cashback earned",
                        `+${cashbackCalculation.points} OnePoints (${cashbackCalculation.usdcValue} USDC)`,
                      ],
                    ] as const)
                  : ([
                      [
                        "Cashback earned",
                        `0 pts (send 20+ ${selectedToken} for cashback)`,
                      ],
                    ] as const)),
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
                showAutopay={false}
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
            {transactionConfirmed && recurringNotice ? (
              <div className="mx-auto grid w-full max-w-sm gap-2 rounded-[1rem] border border-primary/25 bg-primary/5 px-4 py-3 text-left">
                <p className="text-sm font-semibold text-foreground">
                  Your schedule is set
                </p>
                <p className="text-xs text-muted-foreground">
                  Go to Recurepay to authorize Autopay so future payments
                  settle automatically.
                </p>
                <Link
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                  href="/recurepay"
                >
                  Authorize Autopay in Recurepay
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
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
                      : isBusy || (isConnected && !canSubmitPayment && !(step === 3 && isTreasuryMismatch))
              }
              onClick={
                step === 3 && isTreasuryMismatch && onSwitchToTreasury
                  ? (e) => {
                      e.preventDefault();
                      onSwitchToTreasury();
                    }
                  : undefined
              }
              tabIndex={step >= 4 && !paymentError ? -1 : undefined}
              type={step === 3 && isTreasuryMismatch ? "button" : "submit"}
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === 3 ? (
                isTreasuryMismatch ? (
                  <Wallet className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )
              ) : null}
              {step === 3 || (step >= 4 && paymentError)
                ? isBusy
                  ? "Confirming"
                  : isTreasuryMismatch && treasuryAddress
                    ? `Switch to Treasury (${shortenAddress(treasuryAddress)})`
                    : primaryButtonText
                : "Continue"}
            </Button>
        </div>
      </form>
    </div>
  );
}
