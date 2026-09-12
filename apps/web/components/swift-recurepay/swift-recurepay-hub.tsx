"use client";

import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  CalendarClock,
  CheckCircle2,
  KeyRound,
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
  encodeFunctionData,
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
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { KpiCard } from "@/components/design/kpi-card";
import { useT } from "@/components/locale-provider";
import {
  RecurringScheduleFields,
  createRecurringDraft,
  datetimeLocalToIso,
  startTimeError,
  type RecurringScheduleDraft,
} from "@/components/recurring-schedule-fields";
import { showSuccess } from "@/components/success-popup";
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
  recurringPlatformFeeBasisPoints,
  swiftBatchFeeRecipient,
  swiftRecurepayExecutorAddress,
} from "@/lib/contracts";
import { formatUnitsToDecimal } from "@/lib/save/decimal";
import { useResolvedRecipient } from "@/lib/use-resolved-recipient";
import {
  authorizeRecurringSchedule,
  createRecurringSchedule,
  deleteRecurringSchedule,
  fetchRecurringExecutions,
  fetchRecurringSchedules,
  runRecurringScheduleNow,
  updateRecurringExecution,
  updateRecurringSchedule,
} from "@/lib/recurring-schedules";
import {
  formatAuthorizationStatusLabel,
  formatExecutionStatusLabel,
  formatFrequencyLabel,
  formatScheduleRecipient,
  isCompletedDisplayStatus,
  isDueDisplayStatus,
  isProcessingDisplayStatus,
  type RecurringExecutionRecord,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { ensureProfile, fetchProfile } from "@/lib/profile";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import {
  fetchWalletSession,
  signInWalletSession,
} from "@/lib/wallet-auth-client";
import { arcTestnet } from "@/lib/wagmi";

type CircleTransferChallenge = { challengeId?: string };
type CircleChallengeResult = {
  data?: {
    id?: string;
    transaction?: { txHash?: string; transactionHash?: string; hash?: string };
    transactionHash?: string;
    transactionId?: string;
    txHash?: string;
    hash?: string;
  };
  hash?: string;
  id?: string;
  transactionHash?: string;
  transactionId?: string;
  txHash?: string;
};

function isTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/i.test(value);
}

function extractCircleTxHash(result: CircleChallengeResult | undefined) {
  if (!result) return undefined;
  const data = result.data;
  const nested = data?.transaction;
  const candidates = [
    data?.txHash,
    data?.transactionHash,
    data?.hash,
    nested?.txHash,
    nested?.transactionHash,
    nested?.hash,
    result.txHash,
    result.transactionHash,
    result.hash,
  ];
  return candidates.find(isTxHash);
}

function extractCircleTransactionId(result: CircleChallengeResult | undefined) {
  if (!result) return undefined;
  const candidates = [
    result.data?.transactionId,
    result.data?.id,
    result.transactionId,
    result.id,
  ];
  return candidates.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function shortenAddress(value?: string) {
  if (!value) return "n/a";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

const feeBps = BigInt(recurringPlatformFeeBasisPoints);
const feeDenom = 10_000n;

function computePlatformFeeUnits(amountUnits: bigint) {
  return (amountUnits * feeBps) / feeDenom;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function SwiftRecurepayHub() {
  const t = useT();
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync, isPending: isSigningIn } = useSignMessage();
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
  const [authWallet, setAuthWallet] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isProfileReady, setIsProfileReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [recipientInput, setRecipientInput] = useState("");
  const [beneficiaryLabel, setBeneficiaryLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<ArcTokenSymbol>("USDC");
  const [narration, setNarration] = useState("SwiftRecurepay schedule");
  const [recurringDraft, setRecurringDraft] =
    useState<RecurringScheduleDraft>(createRecurringDraft);
  const [approvingScheduleId, setApprovingScheduleId] = useState<string | null>(
    null,
  );
  const [authorizingScheduleId, setAuthorizingScheduleId] = useState<string | null>(
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
  // Autopay uses the connected wallet (external or Circle) — no env private key.
  const canUseAutopay = Boolean(ownerAddress);
  const isWalletAuthenticated = Boolean(
    isEmbeddedWalletMode ||
      (ownerAddress &&
        authWallet &&
        authWallet.toLowerCase() === ownerAddress.toLowerCase()),
  );
  const canAccessRecurring = Boolean(
    ownerAddress &&
      isProfileReady &&
      (isEmbeddedWalletMode
        ? Boolean(circleIdentity.socialUserUUID)
        : isWalletAuthenticated),
  );
  const isAuthenticatingWallet = isAuthLoading || isSigningIn;

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
      executions.filter(
        (execution) =>
          isDueDisplayStatus(execution.status) &&
          execution.execution_mode !== "autopay",
      ),
    [executions],
  );
  const processingExecutions = useMemo(
    () =>
      executions.filter(
        (execution) =>
          isProcessingDisplayStatus(execution.status) ||
          (execution.execution_mode === "autopay" &&
            isDueDisplayStatus(execution.status)),
      ),
    [executions],
  );
  const historyExecutions = useMemo(
    () =>
      executions.filter(
        (execution) =>
          isCompletedDisplayStatus(execution.status) ||
          execution.status === "FAILED" ||
          execution.status === "FAILED_PERMANENTLY" ||
          execution.status === "failed" ||
          execution.status === "RETRYING",
      ),
    [executions],
  );

  const activeSchedules = schedules.filter(
    (schedule) => schedule.status === "active",
  ).length;

  const refreshData = useCallback(async (silent = false) => {
    if (!canAccessRecurring || !requestContext) {
      setSchedules([]);
      setExecutions([]);
      setIsLoading(false);
      return;
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [nextSchedules, nextExecutions] = await Promise.all([
        fetchRecurringSchedules(requestContext),
        fetchRecurringExecutions(requestContext),
      ]);
      setSchedules(nextSchedules);
      setExecutions(nextExecutions);
    } catch (refreshError) {
      if (!silent) {
        setError(getErrorMessage(refreshError));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [canAccessRecurring, requestContext]);

  useEffect(() => {
    setCircleLogin(readCircleLogin());
    const wallets = readCircleWallets();
    setCircleWallet(wallets[0] ?? null);
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!canAccessRecurring || !requestContext) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshData(true);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canAccessRecurring, refreshData, requestContext]);

  useEffect(() => {
    if (!ownerAddress) {
      setAuthWallet(null);
      setIsProfileReady(false);
      return;
    }

    const connectedAddress = ownerAddress;
    let cancelled = false;

    async function bootstrapWalletAccess() {
      setIsAuthLoading(true);

      try {
        await fetchProfile(connectedAddress).catch(() => null);
        await ensureProfile({
          authProvider: isEmbeddedWalletMode ? "google" : "external",
          circleSocialUuid: circleIdentity.socialUserUUID,
          walletAddress: connectedAddress,
        });

        if (!cancelled) {
          setIsProfileReady(true);
        }

        if (!isEmbeddedWalletMode) {
          const session = await fetchWalletSession();
          const sessionWallet = session.ownerWallet;

          if (!cancelled) {
            setAuthWallet(
              session.authenticated &&
                sessionWallet?.toLowerCase() === connectedAddress.toLowerCase()
                ? sessionWallet
                : null,
            );
          }
        }
      } catch {
        if (!cancelled) {
          setIsProfileReady(false);
          setAuthWallet(null);
        }
      } finally {
        if (!cancelled) {
          setIsAuthLoading(false);
        }
      }
    }

    void bootstrapWalletAccess();

    return () => {
      cancelled = true;
    };
  }, [circleIdentity.socialUserUUID, isEmbeddedWalletMode, ownerAddress]);

  async function handleWalletSignIn() {
    if (!ownerAddress || isEmbeddedWalletMode) {
      return;
    }

    setError(null);
    setSuccess(null);
    setIsAuthLoading(true);

    try {
      const session = await signInWalletSession({
        connectorName: connector?.name,
        ownerWallet: ownerAddress,
        signMessage: (message) => signMessageAsync({ message }),
      });
      setAuthWallet(session.ownerWallet ?? ownerAddress);
      setSuccess("Wallet authorized for SwiftRecurepay.");
    } catch (signInError) {
      setError(getErrorMessage(signInError));
    } finally {
      setIsAuthLoading(false);
    }
  }

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

    const startError = startTimeError(recurringDraft.startsAt);
    if (startError) {
      setError(startError);
      return;
    }

    const startsAt = datetimeLocalToIso(recurringDraft.startsAt);
    const endsAt = datetimeLocalToIso(recurringDraft.endsAt);
    if (
      startsAt &&
      endsAt &&
      new Date(endsAt).getTime() < new Date(startsAt).getTime()
    ) {
      setError("End time must be after the start time.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const schedule = await createRecurringSchedule({
        amount,
        autopayEnabled: canUseAutopay ? recurringDraft.autopayEnabled : undefined,
        beneficiaryLabel: beneficiaryLabel || undefined,
        beneficiaryUsername: resolvedRecipientUsername ?? undefined,
        beneficiaryWallet: resolvedRecipientAddress,
        circleSocialUuid: requestContext.circleSocialUuid,
        endsAt: datetimeLocalToIso(recurringDraft.endsAt),
        frequency: recurringDraft.frequency,
        intervalDays:
          recurringDraft.frequency === "custom"
            ? Number(recurringDraft.intervalDays) || undefined
            : undefined,
        maxRuns: recurringDraft.maxRuns
          ? Number(recurringDraft.maxRuns)
          : undefined,
        narration,
        ownerWallet: ownerAddress,
        startsAt: datetimeLocalToIso(recurringDraft.startsAt),
        tokenSymbol: token,
        walletMode: isEmbeddedWalletMode ? "circle" : "external",
      });

      setSchedules((current) => [schedule, ...current]);
      setRecipientInput("");
      setBeneficiaryLabel("");
      setAmount("");

      if (recurringDraft.autopayEnabled) {
        try {
          await authorizeScheduleAutopay(schedule);
          await refreshData();
          setSuccess(
            "Schedule created. Autopay is authorized. Due payments run in the background without this page.",
          );
          showSuccess({
            amount: `${schedule.amount} ${schedule.token_symbol}`,
            eyebrow: "RecurePay",
            subtitle: "Autopay is authorized for background settlement.",
            title: "Recurring payment created",
          });
        } catch (authorizeError) {
          setSuccess("Schedule created. Authorize Autopay to enable background payments.");
          showSuccess({
            amount: `${schedule.amount} ${schedule.token_symbol}`,
            eyebrow: "RecurePay",
            subtitle: "Authorize Autopay from this page to enable background payments.",
            title: "Recurring payment created",
          });
          setError(getErrorMessage(authorizeError));
        }
      } else {
        setSuccess(
          "Schedule created. Use Pay now for a manual run, or authorize Autopay to let the backend execute when due.",
        );
        showSuccess({
          amount: `${schedule.amount} ${schedule.token_symbol}`,
          eyebrow: "RecurePay",
          rows: [
            {
              label: "Start",
              value: new Date(schedule.starts_at).toLocaleString(),
            },
            {
              label: "End",
              value: schedule.ends_at
                ? new Date(schedule.ends_at).toLocaleString()
                : "Open",
            },
          ],
          subtitle: "Manage this schedule from this page.",
          title: "Recurring payment created",
        });
      }
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

  async function approveExecutorForSchedule(schedule: RecurringScheduleRecord) {
    if (!ownerAddress || !swiftRecurepayExecutorAddress) {
      throw new Error("Autopay executor is not configured.");
    }

    const scheduleToken = arcTestnetTokens[schedule.token_symbol];

    if (isEmbeddedWalletMode) {
      if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
        throw new Error("Circle wallet is not ready to authorize Autopay.");
      }

      const callData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [swiftRecurepayExecutorAddress as Address, maxUint256],
      });
      const challenge = await callCircleWalletApi<{ challengeId?: string }>(
        "createContractExecution",
        {
          callData,
          contractAddress: scheduleToken.address,
          feeLevel: "MEDIUM",
          refId: "SwiftRecurepay Autopay approve",
          userToken: circleLogin.userToken,
          walletId: circleWallet.id,
        },
      );
      if (!challenge.challengeId) {
        throw new Error("Circle did not return an Autopay approval challenge.");
      }
      const { txHash } = await executeCircleChallenge(challenge.challengeId);
      return txHash;
    }

    if (!(await ensureArcNetwork())) {
      throw new Error("Switch to Arc Testnet before authorizing Autopay.");
    }

    const hash = await writeContractAsync({
      abi: erc20Abi,
      address: scheduleToken.address,
      args: [swiftRecurepayExecutorAddress as Address, maxUint256],
      functionName: "approve",
      chainId: arcTestnet.id,
    });
    return hash;
  }

  async function authorizeScheduleAutopay(schedule: RecurringScheduleRecord) {
    if (!requestContext) {
      throw new Error("Authorize this wallet before enabling Autopay.");
    }

    setAuthorizingScheduleId(schedule.id);
    setApprovingScheduleId(schedule.id);
    setError(null);

    try {
      const txHash = await approveExecutorForSchedule(schedule);
      const updated = await authorizeRecurringSchedule(schedule.id, {
        ...requestContext,
        authorizationTxHash: txHash,
        maxPaymentAmountUnits: schedule.amount_units,
      });
      setSchedules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await refetchExecutorAllowance();
      return updated;
    } finally {
      setAuthorizingScheduleId(null);
      setApprovingScheduleId(null);
    }
  }

  async function handleDisableAutopay(schedule: RecurringScheduleRecord) {
    if (!requestContext) {
      return;
    }

    try {
      const updated = await authorizeRecurringSchedule(schedule.id, {
        ...requestContext,
        action: "revoke",
      });
      setSchedules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSuccess("Autopay authorization revoked. Background payments will stop.");
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

  async function recoverCircleTxHash(input: {
    skipHashes?: string[];
    transactionId?: string;
  }) {
    if (!circleLogin || !circleWallet?.id) {
      return null;
    }

    const skip = new Set(
      (input.skipHashes ?? []).map((hash) => hash.toLowerCase()),
    );

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      try {
        if (input.transactionId) {
          const tx = await callCircleWalletApi<{
            data?: { txHash?: string; transactionHash?: string };
            txHash?: string;
            transactionHash?: string;
          }>("getTransaction", {
            id: input.transactionId,
            userToken: circleLogin.userToken,
          });
          const hash =
            tx.data?.txHash ??
            tx.data?.transactionHash ??
            tx.txHash ??
            tx.transactionHash;
          if (isTxHash(hash) && !skip.has(hash.toLowerCase())) {
            return hash;
          }
        }

        const listed = await callCircleWalletApi<{
          data?: {
            transactions?: Array<{ txHash?: string; transactionHash?: string }>;
          };
          transactions?: Array<{ txHash?: string; transactionHash?: string }>;
        }>("listTransactions", {
          pageSize: 8,
          userToken: circleLogin.userToken,
          walletId: circleWallet.id,
        });
        const rows = listed.data?.transactions ?? listed.transactions ?? [];
        for (const row of rows) {
          const hash = row.txHash ?? row.transactionHash;
          if (isTxHash(hash) && !skip.has(hash.toLowerCase())) {
            return hash;
          }
        }
      } catch {
        // keep polling
      }
    }

    return null;
  }

  async function executeCircleChallenge(
    challengeId: string,
    skipHashes: string[] = [],
  ) {
    if (!circleLogin || !circleSdkRef.current) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    circleSdkRef.current.setAuthentication({
      encryptionKey: circleLogin.encryptionKey,
      userToken: circleLogin.userToken,
    });

    const executed = await new Promise<{
      transactionId?: string;
      txHash?: string;
    }>((resolve, reject) => {
      circleSdkRef.current?.execute(challengeId, (executeError, result) => {
        if (executeError) {
          reject(executeError);
          return;
        }

        const challengeResult = result as CircleChallengeResult | undefined;
        resolve({
          transactionId: extractCircleTransactionId(challengeResult),
          txHash: extractCircleTxHash(challengeResult),
        });
      });
    });

    let txHash = executed.txHash;
    if (!txHash) {
      txHash =
        (await recoverCircleTxHash({
          skipHashes,
          transactionId: executed.transactionId,
        })) ?? undefined;
    }

    if (!txHash) {
      throw new Error("Circle transfer completed without a transaction hash.");
    }

    return { txHash };
  }

  async function executePaymentForSchedule(
    schedule: RecurringScheduleRecord,
    executionId: string,
  ) {
    if (!ownerAddress) {
      throw new Error("Connect a wallet before paying.");
    }

    if (
      schedule.owner_wallet.toLowerCase() !== ownerAddress.toLowerCase()
    ) {
      throw new Error("Connect the wallet that owns this schedule to autopay.");
    }

    const amountUnits = BigInt(schedule.amount_units);
    const feeUnits = computePlatformFeeUnits(amountUnits);
    const feeRecipient =
      swiftBatchFeeRecipient && isAddress(swiftBatchFeeRecipient)
        ? (getAddress(swiftBatchFeeRecipient) as Address)
        : null;
    const feeAmountText =
      feeUnits > 0n
        ? formatUnitsToDecimal(
            feeUnits,
            arcTestnetTokens[schedule.token_symbol].decimals,
          )
        : "0";

    if (isEmbeddedWalletMode) {
      if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
        throw new Error("Circle wallet is not ready.");
      }

      const tokenInfo = arcTestnetTokens[schedule.token_symbol];
      const tokenBalance = findCircleTokenBalance(
        circleBalances,
        schedule.token_symbol,
      );

      const skipHashes: string[] = [];

      // Platform fee (1%) — separate transfer; not shown in user history UI.
      if (feeUnits > 0n && feeRecipient) {
        const feeChallenge = await callCircleWalletApi<CircleTransferChallenge>(
          "createTransfer",
          {
            amount: feeAmountText,
            blockchain: circleWallet.blockchain ?? "ARC-TESTNET",
            destinationAddress: feeRecipient,
            feeLevel: "MEDIUM",
            refId: "SwiftRecurepay fee",
            tokenAddress: tokenInfo.address,
            tokenId: tokenBalance?.token?.id,
            userToken: circleLogin.userToken,
            walletId: circleWallet.id,
          },
        );
        if (!feeChallenge.challengeId) {
          throw new Error("Circle did not return a fee transfer challenge.");
        }
        const feeResult = await executeCircleChallenge(feeChallenge.challengeId);
        skipHashes.push(feeResult.txHash);
      }

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

      const { txHash } = await executeCircleChallenge(
        challenge.challengeId,
        skipHashes,
      );

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

    // Platform fee (1%) to fee recipient — filtered out of dashboard history.
    if (feeUnits > 0n && feeRecipient) {
      await writeContractAsync({
        address: tokenInfo.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [feeRecipient, feeUnits],
        chainId: arcTestnet.id,
      });
    }

    const hash = await writeContractAsync({
      address: tokenInfo.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [
        schedule.beneficiary_wallet as Address,
        amountUnits,
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

  async function handleEnableAutopay(schedule: RecurringScheduleRecord) {
    setError(null);
    setSuccess(null);
    try {
      await authorizeScheduleAutopay(schedule);
      setSuccess(
        "Autopay authorized. Due payments execute in the background even if you log out.",
      );
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    }
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
      showSuccess({
        explorerUrl: `${arcTestnet.blockExplorers.default.url}/tx/${txHash}`,
        eyebrow: "RecurePay",
        subtitle: "The scheduled payment was submitted on Arc.",
        title: "Payment successful",
      });
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
    <div className="grid min-w-0 gap-4 overflow-x-hidden">
      {!ownerAddress ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Wallet required</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect an external wallet or sign in with Google from Home before
                managing recurring payments.
              </p>
            </div>
            <Wallet className="h-5 w-5 text-primary" />
          </div>
        </section>
      ) : null}

      {ownerAddress && !canAccessRecurring ? (
        <section className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">Authorize this wallet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isEmbeddedWalletMode
                    ? "Your Circle session is missing a linked profile. Return to Home, sign in with Google, then reopen SwiftRecurepay."
                    : "Sign a one-time message to authorize recurring schedules and executions for this wallet."}
                </p>
              </div>
            </div>
            {!isEmbeddedWalletMode ? (
              <Button
                disabled={isAuthenticatingWallet}
                onClick={() => void handleWalletSignIn()}
              >
                {isAuthenticatingWallet ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Authorize wallet
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="section-panel">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-eyebrow">{t("recure.eyebrow")}</p>
            <h1 className="section-title">{t("recure.heading")}</h1>
            <p className="section-copy">{t("recure.body")}</p>
          </div>
          <Button
            disabled={!canAccessRecurring || isLoading}
            onClick={() => void refreshData()}
            variant="outline"
          >
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
              executions.filter((execution) =>
                isCompletedDisplayStatus(execution.status),
              ).length,
            )}
          />
        </div>
      </section>


      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_min(24rem,100%)]">
        <section className="glass-panel min-w-0 overflow-x-hidden p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-eyebrow">{t("recure.dueQueue")}</p>
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
              No manual payments waiting. Authorized Autopay runs in the
              background and appears in execution history after settlement.
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {schedule.amount} {schedule.token_symbol}
                          </p>
                          <Badge variant="outline">
                            {formatExecutionStatusLabel(execution.status)}
                          </Badge>
                          <Badge variant="outline">
                            +{recurringPlatformFeeBasisPoints / 100}% fee
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          To {formatScheduleRecipient(schedule)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {new Date(execution.due_at).toLocaleString()}
                          {" · "}
                          Platform fee {recurringPlatformFeeBasisPoints / 100}%
                          is charged separately and hidden from history
                        </p>
                        {execution.error_message ? (
                          <p className="mt-1 text-xs text-destructive">
                            {execution.error_message}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-panel min-w-0 overflow-x-hidden p-4 sm:p-5">
          <div className="mb-4">
            <p className="section-eyebrow">{t("recure.create")}</p>
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

            <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
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
              <span className="text-sm font-semibold">Narration</span>
              <Input
                onChange={(event) => setNarration(event.target.value)}
                value={narration}
              />
            </label>

            <RecurringScheduleFields
              onChange={setRecurringDraft}
              showAutopay={canUseAutopay}
              value={recurringDraft}
            />

            <Button
              disabled={
                !canAccessRecurring ||
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
          <p className="section-eyebrow">{t("recure.schedules")}</p>
          <h2 className="section-title">{t("recure.managed")}</h2>
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
                      {schedule.autopay_enabled &&
                      schedule.authorization_status === "AUTHORIZED" ? (
                        <Badge variant="secondary">Autopay</Badge>
                      ) : null}
                      <Badge variant="outline">
                        {formatAuthorizationStatusLabel(
                          schedule.authorization_status,
                        )}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatScheduleRecipient(schedule)} ·{" "}
                      {formatFrequencyLabel(schedule.frequency, schedule.interval_days)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(schedule.next_run_at).getTime() <= Date.now() &&
                      schedule.autopay_enabled &&
                      schedule.authorization_status === "AUTHORIZED"
                        ? "Due now. Autopay is queued in the background"
                        : `Next run ${new Date(schedule.next_run_at).toLocaleString()}`}
                      {" · "}
                      {schedule.run_count} completed
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {schedule.authorization_status === "AUTHORIZED" &&
                    schedule.autopay_enabled ? (
                      <Button
                        onClick={() => void handleDisableAutopay(schedule)}
                        size="sm"
                        variant="outline"
                      >
                        Revoke Autopay
                      </Button>
                    ) : (
                      <Button
                        disabled={
                          authorizingScheduleId === schedule.id ||
                          approvingScheduleId === schedule.id
                        }
                        onClick={() => void handleEnableAutopay(schedule)}
                        size="sm"
                        variant="outline"
                      >
                        {authorizingScheduleId === schedule.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Authorize Autopay
                      </Button>
                    )}
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

      {processingExecutions.length > 0 ? (
        <section className="section-panel">
          <div className="mb-4">
            <p className="section-eyebrow">{t("recure.inFlight")}</p>
            <h2 className="section-title">{t("recure.processing")}</h2>
          </div>
          <div className="grid gap-3">
            {processingExecutions.map((execution) => {
              const schedule = scheduleMap.get(execution.schedule_id);
              return (
                <article
                  className="rounded-lg border border-border bg-card px-4 py-3"
                  key={execution.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {execution.amount ?? schedule?.amount}{" "}
                      {schedule?.token_symbol}
                    </p>
                    <Badge variant="secondary">
                      {formatExecutionStatusLabel(execution.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Occurrence {execution.occurrence_number ?? "n/a"}
                    {execution.tx_hash
                      ? ` · ${execution.tx_hash.slice(0, 10)}…`
                      : ""}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="section-panel">
        <div className="mb-4">
          <p className="section-eyebrow">{t("recure.history")}</p>
          <h2 className="section-title">{t("recure.executionHistory")}</h2>
        </div>
        {historyExecutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completed or failed Autopay runs yet.
          </p>
        ) : (
          <div className="grid gap-3">
            {historyExecutions.slice(0, 25).map((execution) => {
              const schedule = scheduleMap.get(execution.schedule_id);
              return (
                <article
                  className="rounded-lg border border-border bg-card px-4 py-3"
                  key={execution.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {execution.amount ?? schedule?.amount}{" "}
                      {schedule?.token_symbol}
                    </p>
                    <Badge
                      variant={
                        isCompletedDisplayStatus(execution.status)
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {formatExecutionStatusLabel(execution.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {schedule ? formatScheduleRecipient(schedule) : execution.owner_wallet}
                    {" · "}
                    {new Date(execution.due_at).toLocaleString()}
                    {execution.tx_hash
                      ? ` · ${execution.tx_hash.slice(0, 10)}…`
                      : ""}
                  </p>
                  {execution.error_message ? (
                    <p className="mt-1 text-xs text-destructive">
                      {execution.error_message}
                    </p>
                  ) : null}
                </article>
              );
            })}
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
