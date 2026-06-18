"use client";

import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAddress,
  isAddress,
  maxUint256,
  type Address,
  type Hash,
} from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { KpiCard } from "@/components/design/kpi-card";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  callCircleWalletApi,
  findCircleTokenBalance,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleTokenBalance,
  type CircleWallet,
} from "@/lib/circle-session";
import {
  erc20Abi,
  swiftRecurepayExecutorAddress,
} from "@/lib/contracts";
import { useResolvedRecipient } from "@/lib/use-resolved-recipient";
import {
  createRecurringSchedule,
  deleteRecurringSchedule,
  fetchRecurringExecutions,
  fetchRecurringSchedules,
  runRecurringScheduleNow,
  updateRecurringExecution,
  updateRecurringSchedule,
} from "@/lib/recurring-schedules";
import {
  formatFrequencyLabel,
  formatScheduleRecipient,
  recurringFrequencies,
  type RecurringExecutionRecord,
  type RecurringFrequency,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

type CircleTransferChallenge = { challengeId?: string };
type CircleChallengeResult = { data?: { txHash?: string } };

function shortenAddress(value?: string) {
  if (!value) return "—";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function SwiftRecurepayHub() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { isPending: isWritePending, writeContractAsync } = useWriteContract();
  const circleSdkRef = useRef<W3SSdk | null>(null);

  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleWallet, setCircleWallet] = useState<CircleWallet | null>(null);
  const [circleBalances, setCircleBalances] = useState<CircleTokenBalance[]>([]);
  const [schedules, setSchedules] = useState<RecurringScheduleRecord[]>([]);
  const [executions, setExecutions] = useState<RecurringExecutionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [payingExecutionId, setPayingExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [recipientInput, setRecipientInput] = useState("");
  const [beneficiaryLabel, setBeneficiaryLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<ArcTokenSymbol>("USDC");
  const [frequency, setFrequency] =
    useState<RecurringFrequency>("monthly");
  const [intervalDays, setIntervalDays] = useState("30");
  const [narration, setNarration] = useState("SwiftRecurepay schedule");
  const [maxRuns, setMaxRuns] = useState("");
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [approvingScheduleId, setApprovingScheduleId] = useState<string | null>(
    null,
  );

  const circleIdentity = getCircleLoginIdentity(circleLogin);
  const circleAddress =
    circleWallet?.address && isAddress(circleWallet.address)
      ? getAddress(circleWallet.address)
      : undefined;
  const isEmbeddedWalletMode = Boolean(circleLogin && circleAddress);
  const ownerAddress = isEmbeddedWalletMode
    ? circleAddress
    : address && isAddress(address)
      ? getAddress(address)
      : undefined;
  const isArcNetwork =
    isEmbeddedWalletMode || (isConnected && chainId === arcTestnet.id);
  const tokenInfo = arcTestnetTokens[token];
  const canUseAutopay =
    !isEmbeddedWalletMode &&
    Boolean(ownerAddress) &&
    Boolean(swiftRecurepayExecutorAddress);

  const { refetch: refetchExecutorAllowance } = useReadContract({
    abi: erc20Abi,
    address: tokenInfo.address,
    args:
      ownerAddress && swiftRecurepayExecutorAddress
        ? [ownerAddress, swiftRecurepayExecutorAddress as Address]
        : undefined,
    chainId: arcTestnet.id,
    functionName: "allowance",
    query: {
      enabled: Boolean(ownerAddress && swiftRecurepayExecutorAddress),
    },
  });

  const {
    error: recipientResolveError,
    isResolving: isRecipientResolving,
    isValid: isRecipientValid,
    resolvedAddress: resolvedRecipientAddress,
    resolvedUsername: resolvedRecipientUsername,
  } = useResolvedRecipient(recipientInput);

  const requestContext = useMemo(
    () =>
      ownerAddress
        ? {
            circleSocialUuid: circleIdentity.socialUserUUID,
            ownerWallet: ownerAddress,
          }
        : null,
    [circleIdentity.socialUserUUID, ownerAddress],
  );

  const scheduleMap = useMemo(
    () => new Map(schedules.map((schedule) => [schedule.id, schedule])),
    [schedules],
  );

  const dueExecutions = useMemo(
    () =>
      executions.filter((execution) => execution.status === "awaiting_wallet"),
    [executions],
  );

  const activeSchedules = schedules.filter(
    (schedule) => schedule.status === "active",
  ).length;

  const refreshData = useCallback(async () => {
    if (!requestContext) {
      setSchedules([]);
      setExecutions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextSchedules, nextExecutions] = await Promise.all([
        fetchRecurringSchedules(requestContext),
        fetchRecurringExecutions(requestContext),
      ]);
      setSchedules(nextSchedules);
      setExecutions(nextExecutions);
    } catch (refreshError) {
      setError(getErrorMessage(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [requestContext]);

  useEffect(() => {
    setCircleLogin(readCircleLogin());
    const wallets = readCircleWallets();
    setCircleWallet(wallets[0] ?? null);
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapCircleSdk() {
      if (!circleLogin?.userToken || !circleWallet?.id) {
        return;
      }

      const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";

      if (!appId) {
        return;
      }

      try {
        const { W3SSdk: CircleW3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

        if (cancelled) {
          return;
        }

        circleSdkRef.current = new CircleW3SSdk({
          appSettings: { appId },
          authentication: {
            encryptionKey: circleLogin.encryptionKey,
            userToken: circleLogin.userToken,
          },
        });

        const balancePayload = await callCircleWalletApi<{
          tokenBalances?: CircleTokenBalance[];
        }>("getTokenBalance", {
          userToken: circleLogin.userToken,
          walletId: circleWallet.id,
        });

        if (!cancelled) {
          setCircleBalances(balancePayload.tokenBalances ?? []);
        }
      } catch {
        if (!cancelled) {
          setCircleBalances([]);
        }
      }
    }

    void bootstrapCircleSdk();

    return () => {
      cancelled = true;
    };
  }, [circleLogin, circleWallet?.id]);

  async function ensureArcNetwork() {
    if (isArcNetwork) {
      return true;
    }

    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      return true;
    } catch (switchError) {
      setError(getErrorMessage(switchError));
      return false;
    }
  }

  async function handleCreateSchedule() {
    if (!requestContext || !ownerAddress) {
      setError("Connect a wallet before creating a recurring schedule.");
      return;
    }

    if (!isRecipientValid || !resolvedRecipientAddress) {
      setError(
        recipientResolveError ?? "Enter a valid recipient wallet or @username.",
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const schedule = await createRecurringSchedule({
        amount,
        autopayEnabled: canUseAutopay ? autopayEnabled : undefined,
        beneficiaryLabel: beneficiaryLabel || undefined,
        beneficiaryUsername: resolvedRecipientUsername ?? undefined,
        beneficiaryWallet: resolvedRecipientAddress,
        circleSocialUuid: requestContext.circleSocialUuid,
        frequency,
        intervalDays:
          frequency === "custom" ? Number(intervalDays) || undefined : undefined,
        maxRuns: maxRuns ? Number(maxRuns) : undefined,
        narration,
        ownerWallet: ownerAddress,
        tokenSymbol: token,
        walletMode: isEmbeddedWalletMode ? "circle" : "external",
      });

      setSchedules((current) => [schedule, ...current]);
      setRecipientInput("");
      setBeneficiaryLabel("");
      setAmount("");
      setSuccess(
        schedule.autopay_enabled
          ? "Schedule created. Approve autopay allowance to finish setup."
          : "SwiftRecurepay schedule created.",
      );
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleScheduleStatus(
    schedule: RecurringScheduleRecord,
    status: "active" | "paused" | "cancelled",
  ) {
    if (!requestContext) {
      return;
    }

    try {
      const updated = await updateRecurringSchedule(schedule.id, {
        ...requestContext,
        status,
      });
      setSchedules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess(
        status === "paused"
          ? "Schedule paused."
          : status === "active"
            ? "Schedule resumed."
            : "Schedule cancelled.",
      );
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!requestContext) {
      return;
    }

    try {
      await deleteRecurringSchedule(scheduleId, requestContext);
      setSchedules((current) => current.filter((item) => item.id !== scheduleId));
      setSuccess("Schedule deleted.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    }
  }

  async function handleApproveExecutor(schedule: RecurringScheduleRecord) {
    if (!ownerAddress || !swiftRecurepayExecutorAddress) {
      setError("Autopay executor is not configured.");
      return;
    }

    if (!(await ensureArcNetwork())) {
      return;
    }

    const scheduleToken = arcTestnetTokens[schedule.token_symbol];
    setApprovingScheduleId(schedule.id);
    setError(null);
    setSuccess(null);

    try {
      await writeContractAsync({
        abi: erc20Abi,
        address: scheduleToken.address,
        args: [swiftRecurepayExecutorAddress as Address, maxUint256],
        functionName: "approve",
        chainId: arcTestnet.id,
      });

      if (requestContext && !schedule.autopay_enabled) {
        const updated = await updateRecurringSchedule(schedule.id, {
          ...requestContext,
          autopayEnabled: true,
        });
        setSchedules((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
      }

      await refetchExecutorAllowance();
      setSuccess("Autopay allowance approved.");
    } catch (approveError) {
      setError(getErrorMessage(approveError));
    } finally {
      setApprovingScheduleId(null);
    }
  }

  async function handleDisableAutopay(schedule: RecurringScheduleRecord) {
    if (!requestContext) {
      return;
    }

    try {
      const updated = await updateRecurringSchedule(schedule.id, {
        ...requestContext,
        autopayEnabled: false,
      });
      setSchedules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess("Autopay disabled for this schedule.");
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    }
  }

  async function handleRunNow(scheduleId: string) {
    if (!requestContext) {
      return;
    }

    try {
      const execution = await runRecurringScheduleNow(scheduleId, requestContext);
      setExecutions((current) => [execution, ...current]);
      setSuccess("Manual run queued for wallet confirmation.");
    } catch (runError) {
      setError(getErrorMessage(runError));
    }
  }

  async function executePaymentForSchedule(
    schedule: RecurringScheduleRecord,
    executionId: string,
  ) {
    if (!ownerAddress) {
      throw new Error("Connect a wallet before paying.");
    }

    if (isEmbeddedWalletMode) {
      if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
        throw new Error("Circle wallet is not ready.");
      }

      const tokenInfo = arcTestnetTokens[schedule.token_symbol];
      const tokenBalance = findCircleTokenBalance(
        circleBalances,
        schedule.token_symbol,
      );
      const challenge = await callCircleWalletApi<CircleTransferChallenge>(
        "createTransfer",
        {
          amount: schedule.amount,
          blockchain: circleWallet.blockchain ?? "ARC-TESTNET",
          destinationAddress: schedule.beneficiary_wallet,
          feeLevel: "MEDIUM",
          refId: (schedule.narration ?? "SwiftRecurepay").slice(0, 50),
          tokenAddress: tokenInfo.address,
          tokenId: tokenBalance?.token?.id,
          userToken: circleLogin.userToken,
          walletId: circleWallet.id,
        },
      );

      if (!challenge.challengeId) {
        throw new Error("Circle did not return a transfer challenge.");
      }

      circleSdkRef.current.setAuthentication({
        encryptionKey: circleLogin.encryptionKey,
        userToken: circleLogin.userToken,
      });

      const txHash = await new Promise<string>((resolve, reject) => {
        circleSdkRef.current?.execute(challenge.challengeId!, (executeError, result) => {
          if (executeError) {
            reject(executeError);
            return;
          }

          const challengeResult = result as CircleChallengeResult | undefined;
          const hash = challengeResult?.data?.txHash;

          if (!hash) {
            reject(new Error("Circle transfer completed without a transaction hash."));
            return;
          }

          resolve(hash);
        });
      });

      await updateRecurringExecution(executionId, {
        ...requestContext!,
        ownerWallet: ownerAddress,
        status: "confirmed",
        txHash,
      });

      return txHash;
    }

    if (!(await ensureArcNetwork())) {
      throw new Error("Switch to Arc Testnet before paying.");
    }

    const tokenInfo = arcTestnetTokens[schedule.token_symbol];
    const hash = await writeContractAsync({
      address: tokenInfo.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [
        schedule.beneficiary_wallet as Address,
        BigInt(schedule.amount_units),
      ],
      chainId: arcTestnet.id,
    });

    await updateRecurringExecution(executionId, {
      ...requestContext!,
      ownerWallet: ownerAddress,
      status: "confirmed",
      txHash: hash,
    });

    return hash;
  }

  async function handlePayExecution(execution: RecurringExecutionRecord) {
    const schedule = scheduleMap.get(execution.schedule_id);

    if (!schedule || !requestContext) {
      setError("Schedule details are unavailable for this payment.");
      return;
    }

    setPayingExecutionId(execution.id);
    setError(null);
    setSuccess(null);

    try {
      const txHash = await executePaymentForSchedule(schedule, execution.id);
      setExecutions((current) =>
        current.map((item) =>
          item.id === execution.id
            ? {
                ...item,
                completed_at: new Date().toISOString(),
                status: "confirmed",
                tx_hash: txHash as Hash,
              }
            : item,
        ),
      );
      setSuccess(`Recurring payment sent (${shortenAddress(txHash)}).`);
    } catch (payError) {
      const message = getErrorMessage(payError);

      try {
        await updateRecurringExecution(execution.id, {
          ...requestContext,
          errorMessage: message,
          ownerWallet: ownerAddress!,
          status: "failed",
        });
      } catch {
        // ignore secondary failure
      }

      setExecutions((current) =>
        current.map((item) =>
          item.id === execution.id
            ? { ...item, error_message: message, status: "failed" }
            : item,
        ),
      );
      setError(message);
    } finally {
      setPayingExecutionId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="section-panel">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-eyebrow">SwiftRecurepay</p>
            <h1 className="section-title">Recurring stablecoin payments</h1>
            <p className="section-copy">
              Schedule USDC and EURC transfers on Arc Testnet, enable autopay with
              a one-time allowance, or confirm each due run manually.
            </p>
          </div>
          <Button disabled={!requestContext || isLoading} onClick={() => void refreshData()} variant="outline">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            change={ownerAddress ? shortenAddress(ownerAddress) : "Connect wallet"}
            icon={Wallet}
            label="Payer wallet"
            value={isEmbeddedWalletMode ? "Circle" : "External"}
          />
          <KpiCard
            change="Active cadence"
            icon={Repeat}
            label="Schedules"
            value={String(activeSchedules)}
          />
          <KpiCard
            change="Awaiting confirmation"
            changeTone={dueExecutions.length > 0 ? "positive" : "neutral"}
            icon={CalendarClock}
            label="Due now"
            value={String(dueExecutions.length)}
          />
          <KpiCard
            change="Confirmed onchain"
            icon={CheckCircle2}
            label="Completed runs"
            value={String(
              executions.filter((execution) => execution.status === "confirmed")
                .length,
            )}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-eyebrow">Due queue</p>
              <h2 className="font-heading text-xl font-semibold">Payments ready to send</h2>
            </div>
            <Badge variant={dueExecutions.length > 0 ? "secondary" : "outline"}>
              {dueExecutions.length} due
            </Badge>
          </div>

          {isLoading ? (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading SwiftRecurepay queue...
            </div>
          ) : dueExecutions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No due payments right now. Cron will queue the next run when a schedule
              reaches its next run timestamp.
            </p>
          ) : (
            <div className="grid gap-3">
              {dueExecutions.map((execution) => {
                const schedule = scheduleMap.get(execution.schedule_id);

                if (!schedule) {
                  return null;
                }

                return (
                  <article
                    className="rounded-lg border border-border bg-card px-4 py-4"
                    key={execution.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {schedule.amount} {schedule.token_symbol}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          To {formatScheduleRecipient(schedule)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {new Date(execution.due_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        disabled={Boolean(payingExecutionId) || !ownerAddress}
                        onClick={() => void handlePayExecution(execution)}
                      >
                        {payingExecutionId === execution.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        Pay now
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-panel p-4 sm:p-5">
          <div className="mb-4">
            <p className="section-eyebrow">Create</p>
            <h2 className="font-heading text-xl font-semibold">New schedule</h2>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">Recipient</span>
              <Input
                onChange={(event) => setRecipientInput(event.target.value)}
                placeholder="0x address or @username"
                value={recipientInput}
              />
              {recipientResolveError ? (
                <span className="text-xs text-destructive">{recipientResolveError}</span>
              ) : null}
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">Label</span>
              <Input
                onChange={(event) => setBeneficiaryLabel(event.target.value)}
                placeholder="Rent, payroll, subscription"
                value={beneficiaryLabel}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Amount</span>
                <div className="field-shell flex h-11 items-center gap-2 px-3">
                  <TokenIcon className="h-5 w-5 rounded-full" symbol={token} />
                  <Input
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    value={amount}
                  />
                </div>
              </label>
              <TokenSelect label="Asset" onChange={setToken} size="sm" value={token} />
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">Frequency</span>
              <select
                className="field-shell h-11 bg-background px-3 text-sm font-semibold outline-none"
                onChange={(event) =>
                  setFrequency(event.target.value as RecurringFrequency)
                }
                value={frequency}
              >
                {recurringFrequencies.map((option) => (
                  <option key={option} value={option}>
                    {formatFrequencyLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            {frequency === "custom" ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Interval days</span>
                <Input
                  inputMode="numeric"
                  onChange={(event) => setIntervalDays(event.target.value)}
                  value={intervalDays}
                />
              </label>
            ) : null}

            <label className="grid gap-2">
              <span className="text-sm font-semibold">Narration</span>
              <Input
                onChange={(event) => setNarration(event.target.value)}
                value={narration}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">Max runs (optional)</span>
              <Input
                inputMode="numeric"
                onChange={(event) => setMaxRuns(event.target.value)}
                placeholder="Unlimited"
                value={maxRuns}
              />
            </label>

            {canUseAutopay ? (
              <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
                <input
                  checked={autopayEnabled}
                  className="mt-1"
                  onChange={(event) => setAutopayEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span className="grid gap-1">
                  <span className="text-sm font-semibold">Enable autopay</span>
                  <span className="text-xs text-muted-foreground">
                    Approve the SwiftRecurepay executor once, then due payments
                    settle automatically without a wallet confirmation.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground">
                Autopay is available for external wallets after the executor
                contract is deployed.
              </p>
            )}

            <Button
              disabled={
                !requestContext ||
                isSaving ||
                isRecipientResolving ||
                !isRecipientValid ||
                !amount ||
                isWritePending
              }
              onClick={() => void handleCreateSchedule()}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create schedule
            </Button>
          </div>
        </section>
      </div>

      <section className="section-panel">
        <div className="mb-4">
          <p className="section-eyebrow">Schedules</p>
          <h2 className="section-title">Managed recurring payments</h2>
        </div>

        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No SwiftRecurepay schedules yet. Create one to automate rent, payroll,
            or subscription transfers.
          </p>
        ) : (
          <div className="grid gap-3">
            {schedules.map((schedule) => (
              <article
                className="rounded-lg border border-border bg-card px-4 py-4"
                key={schedule.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {schedule.amount} {schedule.token_symbol}
                      </p>
                      <Badge variant="outline">{schedule.status}</Badge>
                      {schedule.autopay_enabled ? (
                        <Badge variant="secondary">Autopay</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatScheduleRecipient(schedule)} ·{" "}
                      {formatFrequencyLabel(schedule.frequency, schedule.interval_days)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next run {new Date(schedule.next_run_at).toLocaleString()} ·{" "}
                      {schedule.run_count} completed
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {schedule.wallet_mode === "external" &&
                    swiftRecurepayExecutorAddress ? (
                      schedule.autopay_enabled ? (
                        <Button
                          onClick={() => void handleDisableAutopay(schedule)}
                          size="sm"
                          variant="outline"
                        >
                          Disable autopay
                        </Button>
                      ) : (
                        <Button
                          disabled={Boolean(approvingScheduleId)}
                          onClick={() => void handleApproveExecutor(schedule)}
                          size="sm"
                          variant="outline"
                        >
                          {approvingScheduleId === schedule.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Enable autopay
                        </Button>
                      )
                    ) : null}
                    {schedule.status === "active" ? (
                      <Button
                        onClick={() => void handleScheduleStatus(schedule, "paused")}
                        size="sm"
                        variant="outline"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </Button>
                    ) : null}
                    {schedule.status === "paused" ? (
                      <Button
                        onClick={() => void handleScheduleStatus(schedule, "active")}
                        size="sm"
                        variant="outline"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </Button>
                    ) : null}
                    {schedule.status !== "cancelled" &&
                    schedule.status !== "completed" ? (
                      <>
                        <Button
                          onClick={() => void handleRunNow(schedule.id)}
                          size="sm"
                          variant="outline"
                        >
                          Run now
                        </Button>
                        <Button
                          onClick={() =>
                            void handleScheduleStatus(schedule, "cancelled")
                          }
                          size="sm"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                    <Button
                      onClick={() => void handleDeleteSchedule(schedule.id)}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? (
        <p className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </p>
      ) : null}
    </div>
  );
}