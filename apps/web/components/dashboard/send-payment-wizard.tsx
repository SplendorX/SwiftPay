"use client";

import { AnimatePresence, motion } from "framer-motion";
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
import { useEffect, useState } from "react";
import { SendStepIndicator } from "@/components/dashboard/send-step-indicator";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
import { Button } from "@/components/ui/button";
import { type BeneficiaryRecord } from "@/lib/beneficiaries";
import type { ArcTokenSymbol } from "@/lib/tokens";

type BillPaymentOption = {
  description: string;
  id: string;
  title: string;
};

export type SendPaymentWizardProps = {
  address?: string;
  authWallet: string | null;
  beneficiaryError: string | null;
  beneficiaryName: string;
  beneficiaryStatus: string | null;
  billPaymentOptions: BillPaymentOption[];
  canSaveBeneficiary: boolean;
  canSubmitPayment: boolean;
  isAuthenticatingWallet: boolean;
  isBeneficiariesLoading: boolean;
  isBeneficiarySaving: boolean;
  isCirclePaymentPending: boolean;
  isConfirming: boolean;
  isConnected: boolean;
  isEmbeddedWalletMode: boolean;
  isRecipientValid: boolean;
  isSubmitting: boolean;
  isSwitchingChain: boolean;
  isWalletAuthenticated: boolean;
  isWritePending: boolean;
  onBeneficiaryNameChange: (value: string) => void;
  onBillSelect: (option: BillPaymentOption) => void;
  onPaymentAmountChange: (value: string) => void;
  onPaymentNarrationChange: (value: string) => void;
  onRecipientChange: (value: string) => void;
  onSaveBeneficiary: () => void;
  onSelectBeneficiary: (beneficiary: BeneficiaryRecord) => void;
  onSelectToken: (token: ArcTokenSymbol) => void;
  onSubmit: () => void;
  onWalletSignIn: () => void;
  paymentAmount: string;
  paymentAmountUnits: bigint | null;
  paymentError: string | null;
  paymentNarration: string;
  paymentStatus: string;
  primaryButtonText: string;
  receiveHref: string;
  recipientAddress: string;
  refreshBalances: () => void;
  savedBeneficiaries: BeneficiaryRecord[];
  selectedBillId: string;
  selectedBillOption: BillPaymentOption;
  selectedToken: ArcTokenSymbol;
  shortenAddress: (value?: string) => string;
  transactionConfirmed: boolean;
  transactionExplorerUrl?: string;
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
      <motion.div
        animate={{ scaleX: [0.4, 1, 0.4] }}
        className="route-line"
        transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
      />
      <div className="route-node">Arc</div>
      <motion.div
        animate={{ scaleX: [0.4, 1, 0.4] }}
        className="route-line"
        transition={{ duration: 2.4, delay: 0.3, ease: "easeInOut", repeat: Infinity }}
      />
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
    billPaymentOptions,
    canSaveBeneficiary,
    canSubmitPayment,
    isAuthenticatingWallet,
    isBeneficiariesLoading,
    isBeneficiarySaving,
    isCirclePaymentPending,
    isConfirming,
    isConnected,
    isEmbeddedWalletMode,
    isRecipientValid,
    isSubmitting,
    isSwitchingChain,
    isWalletAuthenticated,
    isWritePending,
    onBeneficiaryNameChange,
    onBillSelect,
    onPaymentAmountChange,
    onPaymentNarrationChange,
    onRecipientChange,
    onSaveBeneficiary,
    onSelectBeneficiary,
    onSelectToken,
    onSubmit,
    onWalletSignIn,
    paymentAmount,
    paymentError,
    paymentNarration,
    paymentStatus,
    primaryButtonText,
    receiveHref,
    recipientAddress,
    refreshBalances,
    savedBeneficiaries,
    selectedBillId,
    selectedBillOption,
    selectedToken,
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

  useEffect(() => {
    if (isSubmitting || transactionConfirmed) {
      setStep(4);
    }
  }, [isSubmitting, transactionConfirmed]);

  function goNext() {
    if (step === 1 && isRecipientValid) setStep(2);
    else if (step === 2 && hasAmount) setStep(3);
    else if (step === 3) setStep(4);
  }

  function goBack() {
    if (step > 1 && step < 4) setStep((current) => (current - 1) as 1 | 2 | 3 | 4);
  }

  const isBusy =
    isWritePending || isConfirming || isCirclePaymentPending || isSwitchingChain;

  return (
    <div className="send-wizard">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-eyebrow">Send</p>
          <h2 className="mt-1 font-heading text-xl font-semibold tracking-tight sm:text-2xl">
            Send payment
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Four steps from recipient to confirmation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={refreshBalances} size="icon" type="button" variant="outline">
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
        className="send-wizard-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 3) {
            goNext();
            return;
          }
          onSubmit();
        }}
      >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="grid gap-4"
              exit={{ opacity: 0, x: -12 }}
              initial={{ opacity: 0, x: 12 }}
              key="step-1"
              transition={{ duration: 0.25 }}
            >
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Recipient wallet
                </span>
                <div className="field-shell flex h-11 items-center gap-2 px-3">
                  <Wallet className="h-4 w-4 text-primary" />
                  <input
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
                    onChange={(event) => onRecipientChange(event.target.value)}
                    placeholder="0x recipient address"
                    spellCheck={false}
                    value={recipientAddress}
                  />
                </div>
              </label>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
                ) : null}

                <div className="mt-3 grid gap-2">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Saved beneficiaries
                  </span>
                  {isBeneficiariesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </div>
                  ) : savedBeneficiaries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No saved beneficiaries yet.
                    </p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {savedBeneficiaries.map((beneficiary) => (
                        <button
                          className="min-w-[11rem] rounded-lg border border-border bg-card px-3 py-2 text-left transition hover:border-primary/40"
                          key={`${beneficiary.owner_wallet}-${beneficiary.beneficiary_wallet}`}
                          onClick={() => onSelectBeneficiary(beneficiary)}
                          type="button"
                        >
                          <span className="block truncate text-sm font-semibold">
                            {beneficiary.name}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {shortenAddress(beneficiary.beneficiary_wallet)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === 2 ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="grid gap-4"
              exit={{ opacity: 0, x: -12 }}
              initial={{ opacity: 0, x: 12 }}
              key="step-2"
              transition={{ duration: 0.25 }}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-foreground">Amount</span>
                  <div className="field-shell flex h-11 items-center gap-2 px-3">
                    <TokenIcon className="h-5 w-5 rounded-full" symbol={selectedToken} />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      inputMode="decimal"
                      onChange={(event) => onPaymentAmountChange(event.target.value)}
                      placeholder="0.00"
                      value={paymentAmount}
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
                <span className="text-sm font-semibold text-foreground">Narration</span>
                <div className="field-shell p-3">
                  <textarea
                    className="min-h-20 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
                    maxLength={140}
                    onChange={(event) => onPaymentNarrationChange(event.target.value)}
                    placeholder="Payment note or bill reference"
                    value={paymentNarration}
                  />
                </div>
              </label>

              <div className="grid max-h-40 gap-2 overflow-y-auto">
                {billPaymentOptions.map((option) => (
                  <button
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      selectedBillId === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                    key={option.id}
                    onClick={() => onBillSelect(option)}
                    type="button"
                  >
                    <span className="text-sm font-semibold">{option.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Estimated fee: USDC-native gas on Arc Testnet
              </p>
            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="grid gap-4"
              exit={{ opacity: 0, x: -12 }}
              initial={{ opacity: 0, x: 12 }}
              key="step-3"
              transition={{ duration: 0.25 }}
            >
              <PaymentRouteViz
                from={shortenAddress(address)}
                to={
                  isRecipientValid
                    ? shortenAddress(trimmedRecipientAddress)
                    : "Recipient"
                }
              />

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                {[
                  ["Bill", selectedBillOption.title],
                  ["From", shortenAddress(address)],
                  ["To", isRecipientValid ? shortenAddress(trimmedRecipientAddress) : "—"],
                  ["Amount", `${paymentAmount || "0.00"} ${selectedToken}`],
                  ["Narration", trimmedPaymentNarration || "No note"],
                  ["Status", paymentStatus],
                ].map(([label, value]) => (
                  <div
                    className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0"
                    key={label}
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="max-w-[14rem] text-right font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}

          {step === 4 ? (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="grid gap-4 text-center"
              initial={{ opacity: 0, scale: 0.96 }}
              key="step-4"
              transition={{ duration: 0.35 }}
            >
              {transactionConfirmed ? (
                <motion.div
                  animate={{ scale: [0.8, 1.05, 1] }}
                  className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15"
                >
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </motion.div>
              ) : (
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              <div>
                <p className="font-heading text-lg font-semibold">
                  {transactionConfirmed ? "Payment confirmed" : "Processing payment"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{paymentStatus}</p>
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
                <Button onClick={() => setStep(1)} type="button" variant="outline">
                  Send another payment
                </Button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {paymentError ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{paymentError}</span>
          </div>
        ) : null}

        {step < 4 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {step > 1 ? (
              <Button onClick={goBack} type="button" variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : null}
            <Button
              className="ml-auto"
              disabled={
                step === 1
                  ? !isRecipientValid
                  : step === 2
                    ? !hasAmount
                    : step === 3
                      ? isBusy || (isConnected && !canSubmitPayment)
                      : false
              }
              type="submit"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === 3 ? (
                <ArrowRight className="h-4 w-4" />
              ) : null}
              {step === 3
                ? isBusy
                  ? "Confirming"
                  : primaryButtonText
                : "Continue"}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}