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
import { recordPlatformTransactionActivity } from "@/lib/referral/activity-client";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
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
  isoToDatetimeLocalValue,
  startTimeError,
  toDatetimeLocalValue,
  type RecurringScheduleDraft,
} from "@/components/recurring-schedule-fields";
import { showSuccess } from "@/components/success-popup";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { personalCircleWallet } from "@/lib/business/provision-wallet";
import {
  circleSessionEventName,
  currentCircleAuth,
  callCircleWalletApi,
  getCircleErrorMessage,
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
  swiftRecurepayExecutorAbi,
  swiftRecurepayExecutorAddress,
} from "@/lib/contracts";
import { formatUnitsToDecimal } from "@/lib/save/decimal";
import { useResolvedRecipient } from "@/lib/use-resolved-recipient";
import { RecipientSpinner, RecipientStatus } from "@/components/recipient-status";
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
  mandatePeriodSeconds,
  recurringFrequencies,
  type RecurringExecutionRecord,
  type RecurringFrequency,
  type RecurringScheduleRecord,
} from "@/lib/recurring-utils";
import { ensureProfile, fetchProfile } from "@/lib/profile";
import { recoverCircleTxHash as recoverCircleTxHashFor } from "@/lib/circle-tx";
import { arcTokens, arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";
import {
  fetchWalletSession,
  signInWalletSession,
} from "@/lib/wallet-auth-client";
import { arcChain, arcCircleBlockchain } from "@/lib/chains";

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

/**
 * Circle's PIN SDK rejects with plain `{ code, message }` objects, not Errors;
 * reading only Errors hid the real reason as "Something went wrong."
 */
const arcReader = createPublicClient({
  chain: arcChain,
  transport: http(arcChain.rpcUrls.default.http[0]),
});

/**
 * The server re-reads the executor allowance on-chain as soon as it is told
 * about the approval. A Circle wallet can hand back the hash before the
 * transaction is mined, so wait for the receipt and for the allowance to be
 * visible first; otherwise authorization is refused as "not approved".
 */
async function waitForExecutorApproval(input: {
  owner: string;
  requiredUnits: bigint;
  token: Address;
  txHash: string;
}) {
  if (/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) {
    await arcReader
      .waitForTransactionReceipt({ hash: input.txHash as Hash, timeout: 30_000 })
      .catch(() => undefined);
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const allowance = await arcReader
      .readContract({
        abi: erc20Abi,
        address: input.token,
        args: [input.owner as Address, swiftRecurepayExecutorAddress as Address],
        functionName: "allowance",
      })
      .catch(() => 0n);
    if (allowance >= input.requiredUnits) return;
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
}

function getErrorMessage(error: unknown) {
  return getCircleErrorMessage(error, "Something went wrong.");
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
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [token, setToken] = useState<ArcTokenSymbol>("USDC");
  const [narration, setNarration] = useState("RecurePay schedule");
  const [recurringDraft, setRecurringDraft] =
    useState<RecurringScheduleDraft>(createRecurringDraft);
  const [approvingScheduleId, setApprovingScheduleId] = useState<string | null>(
    null,
  );
  const [authorizingScheduleId, setAuthorizingScheduleId] = useState<string | null>(
    null,
  );

  // ALLIE's "Review and authorize" carries the schedule in the URL:
  // /recurepay?recipient=@ada&amount=20&token=USDC&frequency=monthly.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recipient = params.get("recipient")?.trim();
    const linkAmount = params.get("amount")?.trim();
    const linkToken = params.get("token")?.trim().toUpperCase();
    const frequency = params.get("frequency")?.trim().toLowerCase();

    if (recipient) setRecipientInput(recipient);
    if (linkAmount && /^\d+(\.\d+)?$/.test(linkAmount)) setAmount(linkAmount);
    if (linkToken && arcTokenSymbols.includes(linkToken as ArcTokenSymbol)) {
      setToken(linkToken as ArcTokenSymbol);
    }
    if (frequency && recurringFrequencies.includes(frequency as RecurringFrequency)) {
      setRecurringDraft((draft) => ({
        ...draft,
        frequency: frequency as RecurringFrequency,
      }));
    }

    // Schedule bounds from ALLIE: an explicit start, or `startIn` minutes from
    // now so a link opened later still starts in the future.
    const linkStartsAt = params.get("startsAt");
    const startIn = Number(params.get("startIn"));
    const explicitStart = linkStartsAt ? new Date(linkStartsAt) : null;
    const startsAt =
      explicitStart && explicitStart.getTime() > Date.now()
        ? explicitStart
        : Number.isFinite(startIn) && startIn > 0 && startIn <= 24 * 60
          ? new Date(Date.now() + startIn * 60_000)
          : // An explicit start that has already passed: fall back to 30 min.
            linkStartsAt
            ? new Date(Date.now() + 30 * 60_000)
            : null;
    const endsAt = isoToDatetimeLocalValue(params.get("endsAt"));
    const maxRuns = params.get("maxRuns")?.trim();

    if (startsAt || endsAt || maxRuns) {
      setRecurringDraft((draft) => ({
        ...draft,
        ...(startsAt ? { startsAt: toDatetimeLocalValue(startsAt) } : {}),
        ...(endsAt ? { endsAt } : {}),
        ...(maxRuns && /^[1-9]\d{0,3}$/.test(maxRuns) ? { maxRuns } : {}),
      }));
    }
  }, []);

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
    isEmbeddedWalletMode || (isConnected && chainId === arcChain.id);
  const tokenInfo = arcTokens[token];
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
    chainId: arcChain.id,
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
  const recipientResolution = {
    error: recipientResolveError,
    isResolving: isRecipientResolving,
    isValid: isRecipientValid,
    resolvedAddress: resolvedRecipientAddress,
    resolvedUsername: resolvedRecipientUsername,
  };

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
    const sync = () => {
      setCircleLogin(readCircleLogin());
      setCircleWallet(personalCircleWallet(readCircleWallets()));
    };
    sync();
    // Pick up renewed Circle tokens (they expire after about an hour) so the
    // next action uses the current one rather than the token from page load.
    window.addEventListener(circleSessionEventName, sync);
    return () => window.removeEventListener(circleSessionEventName, sync);
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
      setSuccess("Wallet authorized for RecurePay.");
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

        // One SDK instance for the page's lifetime: each instance adds its own
        // iframe and listeners, and several confuse Circle's PIN screen. The
        // current token is applied before every challenge (currentCircleAuth).
        if (!circleSdkRef.current) {
          circleSdkRef.current = new CircleW3SSdk({
            appSettings: { appId },
            authentication: {
              encryptionKey: circleLogin.encryptionKey,
              userToken: circleLogin.userToken,
            },
          });
        }

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
    // Keyed on the token, not the login object, which is re-read on every
    // Circle session event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleLogin?.userToken, circleWallet?.id]);

  async function ensureArcNetwork() {
    if (isArcNetwork) {
      return true;
    }

    try {
      await switchChainAsync({ chainId: arcChain.id });
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
      // Never a silent no-op: say why nothing happened.
      setError("Connect the wallet that owns this schedule to delete it.");
      return;
    }

    setDeletingScheduleId(scheduleId);
    setError(null);
    try {
      const schedule = schedules.find((item) => item.id === scheduleId);
      if (schedule) {
        await cancelScheduleMandate(schedule);
      }
      await deleteRecurringSchedule(scheduleId, requestContext);
      setSchedules((current) => current.filter((item) => item.id !== scheduleId));
      setExecutions((current) => current.filter((item) => item.schedule_id !== scheduleId));
      setSuccess("Schedule deleted.");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setDeletingScheduleId(null);
    }
  }

  /**
   * Cancels a schedule's on-chain mandate if it is still active, so nothing
   * can be paid under it even if the server were compromised.
   */
  async function cancelScheduleMandate(schedule: RecurringScheduleRecord) {
    if (!schedule.authorization_mandate_id || !swiftRecurepayExecutorAddress) {
      return;
    }
    const mandate = await arcReader
      .readContract({
        abi: swiftRecurepayExecutorAbi,
        address: swiftRecurepayExecutorAddress as Address,
        args: [schedule.authorization_mandate_id as Hash],
        functionName: "mandates",
      })
      .catch(() => null);
    const isActive = mandate?.[6] === true;
    if (!isActive) {
      return;
    }

    setSuccess("Confirm cancelling the Autopay mandate in your wallet…");
    try {
      await sendAutopayCall({
        abi: swiftRecurepayExecutorAbi,
        address: swiftRecurepayExecutorAddress as Address,
        args: [schedule.authorization_mandate_id as Hash],
        functionName: "cancelMandate",
        refId: "RecurePay Autopay cancel",
      });
    } finally {
      setSuccess(null);
    }
  }

  /** Sends one contract call from the connected wallet and returns its hash. */
  async function sendAutopayCall(input: {
    abi: typeof erc20Abi | typeof swiftRecurepayExecutorAbi;
    address: Address;
    args: readonly unknown[];
    functionName: string;
    refId: string;
    /** Hashes of earlier calls in this flow, so Circle recovery can't return them. */
    skipHashes?: string[];
  }) {
    if (isEmbeddedWalletMode) {
      if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
        throw new Error("Circle wallet is not ready to authorize Autopay.");
      }

      const callData = encodeFunctionData({
        abi: input.abi,
        args: input.args,
        functionName: input.functionName,
      } as Parameters<typeof encodeFunctionData>[0]);
      const challenge = await callCircleWalletApi<{ challengeId?: string }>(
        "createContractExecution",
        {
          callData,
          contractAddress: input.address,
          feeLevel: "MEDIUM",
          refId: input.refId,
          userToken: circleLogin.userToken,
          walletId: circleWallet.id,
        },
      );
      if (!challenge.challengeId) {
        throw new Error("Circle did not return an Autopay challenge.");
      }
      const { txHash } = await executeCircleChallenge(
        challenge.challengeId,
        input.skipHashes,
      );
      return txHash;
    }

    if (!(await ensureArcNetwork())) {
      throw new Error(`Switch to ${arcChain.name} before authorizing Autopay.`);
    }

    return writeContractAsync({
      abi: input.abi,
      address: input.address,
      args: input.args,
      chainId: arcChain.id,
      functionName: input.functionName,
    } as Parameters<typeof writeContractAsync>[0]);
  }

  /**
   * Authorizes a schedule on-chain in two steps:
   * 1. a bounded allowance to the executor (enough for the remaining runs, at
   *    most a year of them), never an unlimited one;
   * 2. a mandate that fixes this schedule's recipient, token and cap per
   *    period, which is all the operator can ever pay under.
   * Returns the mandate transaction's hash for the server to verify.
   */
  async function createScheduleMandate(schedule: RecurringScheduleRecord) {
    if (!ownerAddress || !swiftRecurepayExecutorAddress) {
      throw new Error("Autopay executor is not configured.");
    }

    const executor = swiftRecurepayExecutorAddress as Address;
    const token = arcTokens[schedule.token_symbol].address as Address;
    const amountUnits = BigInt(schedule.amount_units);
    const perRun = amountUnits + computePlatformFeeUnits(amountUnits);
    const remainingRuns =
      schedule.max_runs && schedule.max_runs > 0
        ? Math.max(1, schedule.max_runs - schedule.run_count)
        : 12;
    const budget = perRun * BigInt(Math.min(remainingRuns, 12));

    const currentAllowance = await arcReader
      .readContract({
        abi: erc20Abi,
        address: token,
        args: [ownerAddress as Address, executor],
        functionName: "allowance",
      })
      .catch(() => 0n);

    const earlierHashes: string[] = [];
    if (currentAllowance < budget) {
      setSuccess("Approve the Autopay spending limit in your wallet…");
      const approveHash = await sendAutopayCall({
        abi: erc20Abi,
        address: token,
        // Other schedules share this allowance, so add to it rather than replace it.
        args: [executor, currentAllowance + budget],
        functionName: "approve",
        refId: "RecurePay Autopay approve",
      });
      earlierHashes.push(approveHash);
      await waitForExecutorApproval({
        owner: ownerAddress,
        requiredUnits: currentAllowance + budget,
        token,
        txHash: approveHash,
      });
    }

    const expiresAt = schedule.ends_at
      ? BigInt(Math.floor(new Date(schedule.ends_at).getTime() / 1000) + 24 * 60 * 60)
      : 0n;

    setSuccess("Confirm the Autopay mandate in your wallet…");
    return sendAutopayCall({
      abi: swiftRecurepayExecutorAbi,
      address: executor,
      args: [
        schedule.beneficiary_wallet as Address,
        token,
        amountUnits,
        BigInt(mandatePeriodSeconds(schedule.frequency, schedule.interval_days)),
        expiresAt,
      ],
      functionName: "createMandate",
      refId: "RecurePay Autopay mandate",
      skipHashes: earlierHashes,
    });
  }

  async function authorizeScheduleAutopay(schedule: RecurringScheduleRecord) {
    if (!requestContext) {
      throw new Error("Authorize this wallet before enabling Autopay.");
    }

    setAuthorizingScheduleId(schedule.id);
    setApprovingScheduleId(schedule.id);
    setError(null);

    try {
      // A mandate from an earlier attempt that didn't finish saving is reused,
      // so retrying never asks for another signature it doesn't need.
      const existing = await authorizeRecurringSchedule(schedule.id, {
        ...requestContext,
        maxPaymentAmountUnits: schedule.amount_units,
      }).catch(() => null);
      const updated =
        existing ??
        (await (async () => {
          const txHash = await createScheduleMandate(schedule);
          setSuccess(`Confirming the Autopay mandate on ${arcChain.name}…`);
          return authorizeRecurringSchedule(schedule.id, {
            ...requestContext,
            authorizationTxHash: txHash,
            maxPaymentAmountUnits: schedule.amount_units,
          });
        })());
      setSuccess(null);
      setSchedules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await refetchExecutorAllowance();
      return updated;
    } catch (authorizeError) {
      setSuccess(null);
      throw authorizeError;
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
      await cancelScheduleMandate(schedule);

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

    // The shared recovery only accepts this transaction's own hash, never
    // the latest one on the wallet (which may be an incoming payment).
    return recoverCircleTxHashFor({
      attempts: 15,
      skipHashes: input.skipHashes,
      transactionId: input.transactionId,
      userToken: circleLogin.userToken,
      walletId: circleWallet.id,
    });
  }

  async function executeCircleChallenge(
    challengeId: string,
    skipHashes: string[] = [],
  ) {
    if (!circleLogin || !circleSdkRef.current) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    circleSdkRef.current.setAuthentication(currentCircleAuth(circleLogin));

    const executed = await new Promise<{
      transactionId?: string;
      txHash?: string;
    }>((resolve, reject) => {
      circleSdkRef.current?.execute(challengeId, (executeError, result) => {
        if (executeError) {
          // The SDK's error keeps code/message in non-enumerable fields, so a
          // plain log prints "{}". Spell them out. warn, not error: a closed
          // PIN window is not a crash and should not raise the dev overlay.
          const details = executeError as unknown as Record<string, unknown> | null;
          console.warn("[Recurepay] Circle challenge failed", {
            code: details?.code,
            message: details?.message,
            name: details?.name,
            fields: details ? Object.getOwnPropertyNames(details) : [],
          });
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
            arcTokens[schedule.token_symbol].decimals,
          )
        : "0";

    if (isEmbeddedWalletMode) {
      if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
        throw new Error("Circle wallet is not ready.");
      }

      const tokenInfo = arcTokens[schedule.token_symbol];
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
            blockchain: circleWallet.blockchain ?? arcCircleBlockchain,
            destinationAddress: feeRecipient,
            feeLevel: "MEDIUM",
            refId: "RecurePay fee",
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
          blockchain: circleWallet.blockchain ?? arcCircleBlockchain,
          destinationAddress: schedule.beneficiary_wallet,
          feeLevel: "MEDIUM",
          refId: (schedule.narration ?? "RecurePay").slice(0, 50),
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
      throw new Error(`Switch to ${arcChain.name} before paying.`);
    }

    const tokenInfo = arcTokens[schedule.token_symbol];

    // Platform fee (1%) to fee recipient — filtered out of dashboard history.
    if (feeUnits > 0n && feeRecipient) {
      await writeContractAsync({
        address: tokenInfo.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [feeRecipient, feeUnits],
        chainId: arcChain.id,
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
      chainId: arcChain.id,
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
        explorerUrl: `${arcChain.blockExplorers.default.url}/tx/${txHash}`,
        eyebrow: "RecurePay",
        subtitle: "The scheduled payment was submitted on Arc.",
        title: "Payment successful",
      });

      if (ownerAddress && txHash && schedule.amount) {
        const recipientLabel = schedule.beneficiary_username
          ? `@${schedule.beneficiary_username.replace(/^@/, "")}`
          : schedule.beneficiary_label || shortenAddress(schedule.beneficiary_wallet);
        void recordPlatformTransactionActivity({
          walletAddress: ownerAddress,
          amount: schedule.amount,
          token: schedule.token_symbol ?? "USDC",
          txHash,
          transactionId: execution.id,
          activityType: "TRANSFER",
          showToast: true,
          activity: {
            counterparty: recipientLabel,
            source: "recurepay",
            title: `Scheduled payment to ${recipientLabel}`,
          },
        });
      }
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
                    ? "Your Circle session is missing a linked profile. Return to Home, sign in with Google, then reopen RecurePay."
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
            <p className="section-copy">{t("recure.body", { network: arcChain.name })}</p>
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


      {/* Two equal columns: the queue and the form carry the same weight. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6">
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
              Loading RecurePay queue...
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
                          Service fee {recurringPlatformFeeBasisPoints / 100}%
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
              <div className="relative">
                <Input
                  aria-describedby="recure-recipient-status"
                  autoComplete="off"
                  className="pr-9"
                  onChange={(event) => setRecipientInput(event.target.value)}
                  placeholder="0x address or @username"
                  spellCheck={false}
                  value={recipientInput}
                />
                <RecipientSpinner resolution={recipientResolution} />
              </div>
              <RecipientStatus id="recure-recipient-status" resolution={recipientResolution} />
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

            {/* Shown before creating, not only once a payment is due. */}
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  Service fee ({recurringPlatformFeeBasisPoints / 100}%)
                </span>
                <span className="font-medium tabular-nums">
                  {Number(amount) > 0
                    ? `${((Number(amount) * recurringPlatformFeeBasisPoints) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${token}`
                    : "—"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Each payment costs</span>
                <span className="font-semibold tabular-nums">
                  {Number(amount) > 0
                    ? `${((Number(amount) * (10_000 + recurringPlatformFeeBasisPoints)) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${token}`
                    : "—"}
                </span>
              </div>
            </div>

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

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="section-panel min-w-0">
          <div className="mb-4">
            <p className="section-eyebrow">{t("recure.schedules")}</p>
            <h2 className="section-title">{t("recure.managed")}</h2>
          </div>

          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Recurepay schedules yet. Create one to automate rent, payroll,
              or subscription transfers.
            </p>
          ) : (
            <div className="grid max-h-[36rem] gap-3 overflow-y-auto pr-1">
              {schedules.map((schedule) => (
                <article
                  className="rounded-lg border border-border bg-card px-4 py-4"
                  key={schedule.id}
                >
                  <div className="grid gap-3">
                    <div className="min-w-0">
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
                        disabled={deletingScheduleId === schedule.id}
                        onClick={() => void handleDeleteSchedule(schedule.id)}
                        size="sm"
                        variant="outline"
                      >
                        {deletingScheduleId === schedule.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="section-panel min-w-0">
          <div className="mb-4">
            <p className="section-eyebrow">{t("recure.history")}</p>
            <h2 className="section-title">{t("recure.executionHistory")}</h2>
          </div>
          {historyExecutions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed or failed Autopay runs yet.
            </p>
          ) : (
            <div className="grid max-h-[36rem] gap-3 overflow-y-auto pr-1">
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
      </div>

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
