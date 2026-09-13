"use client";

import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  Activity,
  ArrowLeft,
  Check,
  Camera,
  Filter,
  HandCoins,
  Home,
  Loader2,
  MessageCircle,
  PiggyBank,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { showSuccess } from "@/components/success-popup";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  encodeFunctionData,
  getAddress,
  maxUint256,
  type Address,
  type Hash,
  type Hex,
} from "viem";

import { CreateCirclePocketDialog } from "@/components/swift-circle/create-circle-pocket-dialog";
import {
  CircleAvatar,
  CircleAvatarStack,
  clockLabel,
  dayLabel,
  payModeLabel,
} from "@/components/swift-circle/circle-visuals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StyledSelect } from "@/components/ui/styled-select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  callCircleWalletApi,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
} from "@/lib/circle-session";
import {
  extractCircleTransactionId,
  extractCircleTxHash,
  isOnchainTxHash,
  recoverCircleTxHash,
} from "@/lib/circle-tx";
import { erc20Abi } from "@/lib/contracts";
import { swiftSaveVaultAbi } from "@/lib/save/abis";
import { swiftSaveVaultAddress } from "@/lib/save/config";
import { SEND_FEE_BPS, platformFeeRecipient, platformFeeUnits } from "@/lib/fees";
import { executeBundledSend } from "@/lib/payments/execute-send";
import {
  archiveCircleSavePocket,
  confirmSave,
  contributeSave,
  createPayment,
  createPaymentRequest,
  createWithdrawal,
  fetchActivity,
  fetchCircleDetail,
  fetchMessages,
  fetchPaymentRequests,
  fetchSave,
  fetchWithdrawals,
  inviteCircleMember,
  postCircleAction,
  postMemberAction,
  postWithdrawalAction,
  respondPaymentRequest,
  sendMessage,
  submitPayment,
  submitSave,
  updateCircleClient,
} from "@/lib/swift-circle/client";
import { formatUsd, parseUnits, progressPercent } from "@/lib/swift-circle/money";
import { hasPermission } from "@/lib/swift-circle/rbac";
import { formatLockRemaining, getPocketLockState } from "@/lib/save/lock";
import { getPocketEmoji } from "@/lib/save/types";
import type {
  CircleActivityRecord,
  CircleMemberRecord,
  CircleMessageRecord,
  CirclePaymentRequestRecord,
  CircleRecord,
  CircleRequestGroupRecord,
  CircleRole,
  CircleSaveAccountRecord,
  CircleSavePocketRecord,
  CirclePlatformLimits,
  CircleWithdrawalProposalRecord,
} from "@/lib/swift-circle/types";
import { arcTestnetTokens } from "@/lib/tokens";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import {
  fetchWalletSessionForAddress,
  signInWalletSession,
} from "@/lib/wallet-auth-client";
import { arcTestnet } from "@/lib/wagmi";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const payload = error as { message?: string; userMessage?: string };
    if (payload.userMessage?.trim()) return payload.userMessage;
    if (payload.message?.trim()) return payload.message;
  }
  return "Something went wrong. Please try again.";
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function memberLabel(member?: Pick<CircleMemberRecord, "username" | "display_name" | "user_wallet"> | null) {
  if (!member) return "Member";
  if (member.display_name) return member.display_name;
  if (member.username) return `@${member.username}`;
  return shortWallet(member.user_wallet);
}

async function fileToCircleImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 384;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process the image.");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function isChatNearBottom(el: HTMLDivElement, threshold = 96) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function chatMessagesUnchanged(
  prev: CircleMessageRecord[],
  next: CircleMessageRecord[],
) {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.content !== b.content ||
      a.deleted_at !== b.deleted_at
    ) {
      return false;
    }
  }
  return true;
}

type ActivityFilterValue =
  | "all"
  | "payment"
  | "request"
  | "save"
  | "withdrawal"
  | "member";

const activityFilterOptions: Array<{
  label: string;
  value: ActivityFilterValue;
}> = [
  { label: "All", value: "all" },
  { label: "Pay", value: "payment" },
  { label: "Requests", value: "request" },
  { label: "Save", value: "save" },
  { label: "Withdrawals", value: "withdrawal" },
  { label: "People", value: "member" },
];

export function SwiftCircleHub() {
  const params = useParams<{ id: string }>();
  const circleId = params.id;
  const { address: wagmiAddress } = useAccount();
  const {
    address: platformAddress,
    circleSocialUuid: platformCircleSocialUuid,
    circleWallet: platformCircleWallet,
  } = usePlatformWallet();
  const address = (platformAddress ?? wagmiAddress)?.toLowerCase() ?? "";
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const circleSdkRef = useRef<W3SSdk | null>(null);

  const [circle, setCircle] = useState<CircleRecord | null>(null);
  const [me, setMe] = useState<CircleMemberRecord | null>(null);
  const [members, setMembers] = useState<CircleMemberRecord[]>([]);
  const [messages, setMessages] = useState<CircleMessageRecord[]>([]);
  const [activity, setActivity] = useState<CircleActivityRecord[]>([]);
  const [requests, setRequests] = useState<CirclePaymentRequestRecord[]>([]);
  const [requestGroups, setRequestGroups] = useState<CircleRequestGroupRecord[]>([]);
  const [save, setSave] = useState<CircleSaveAccountRecord | null>(null);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);

  const [savePockets, setSavePockets] = useState<CircleSavePocketRecord[]>([]);
  const [selectedPocketId, setSelectedPocketId] = useState<string>("");
  const [createPocketOpen, setCreatePocketOpen] = useState(false);
  const [withdrawals, setWithdrawals] = useState<CircleWithdrawalProposalRecord[]>([]);
  const [vaultAddress, setVaultAddress] = useState<string | null>(
    () => swiftSaveVaultAddress(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("chat");
  const [chatText, setChatText] = useState("");
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const pinChatToBottomRef = useRef(true);
  const [inviteName, setInviteName] = useState("");
  const [payMode, setPayMode] = useState<
    "pick" | "everyone" | "equal_split" | "custom_split"
  >("pick");
  const [memberQuery, setMemberQuery] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestMode, setRequestMode] = useState<"pick" | "everyone">("pick");
  const [contributeAmount, setContributeAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(null);
  const [circleWallet, setCircleWallet] = useState<CircleWallet | null>(null);
  const [circleSdkReady, setCircleSdkReady] = useState(false);
  const [editName, setEditName] = useState("");
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilterValue>("all");
  const [limits, setLimits] = useState<CirclePlatformLimits | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  const social =
    platformCircleSocialUuid ??
    getCircleLoginIdentity(circleLogin ?? readCircleLogin())?.socialUserUUID;
  const others = members.filter(
    (member) => member.status === "active" && member.user_wallet !== address,
  );
  const role: CircleRole = me?.role ?? "member";
  const selectedPocket =
    savePockets.find((pocket) => pocket.id === selectedPocketId) ?? null;
  const selectedPocketLock = selectedPocket
    ? getPocketLockState(selectedPocket)
    : null;
  const token = arcTestnetTokens[circle?.currency ?? "USDC"];

  const load = useCallback(async (opts?: { preserveError?: string }) => {
    if (!address || !circleId) return;
    if (!opts?.preserveError) {
      setLoading(true);
      setError(null);
    }
    try {
      if (!social) {
        const session = await fetchWalletSessionForAddress(address);
        if (!session.authenticated) {
          setError("Authorize this wallet to open the Circle.");
          return;
        }
      }
      const detail = await fetchCircleDetail(circleId, address, social);
      setCircle(detail.circle);
      setMe(detail.member);
      setMembers(detail.members);
      setSave(detail.save);
      setLimits(detail.limits);
      setActiveCount(detail.activeCount);
      setEditName(detail.circle.name);

      const [msgs, acts, reqs, saveOv, wds] = await Promise.all([
        fetchMessages(circleId, address, social),
        fetchActivity(circleId, address, social),
        fetchPaymentRequests(circleId, address, social),
        fetchSave(circleId, address, social),
        fetchWithdrawals(circleId, address, social),
      ]);
      setMessages(msgs.messages);
      setActivity(acts.activity);
      setRequests(reqs.requests);
      setRequestGroups(reqs.groups);
      setSave(saveOv.account);
      setSaveProgress(saveOv.progress);
      const pockets = saveOv.pockets ?? [];
      setSavePockets(pockets);
      setSelectedPocketId((current) => {
        if (current && pockets.some((pocket) => pocket.id === current && pocket.status === "active")) {
          return current;
        }
        return pockets.find((pocket) => pocket.status === "active")?.id ?? "";
      });
      setVaultAddress(saveOv.vaultAddress ?? swiftSaveVaultAddress());
      setWithdrawals(wds.withdrawals);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      if (opts?.preserveError) setError(opts.preserveError);
    }
  }, [address, circleId, social]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "chat") return;
    const timer = window.setInterval(() => {
      if (!address || !circleId) return;
      void fetchMessages(circleId, address, social)
        .then((result) => {
          setMessages((prev) =>
            chatMessagesUnchanged(prev, result.messages) ? prev : result.messages,
          );
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [tab, address, circleId, social]);

  useEffect(() => {
    const login = readCircleLogin();
    setCircleLogin(login);
    setCircleWallet(platformCircleWallet ?? readCircleWallets()[0] ?? null);
    if (!login) {
      circleSdkRef.current = null;
      setCircleSdkReady(false);
      return;
    }
    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";
    if (!appId) return;
    let cancelled = false;
    void import("@circle-fin/w3s-pw-web-sdk").then(({ W3SSdk }) => {
      if (cancelled) return;
      circleSdkRef.current = new W3SSdk({
        appSettings: { appId },
        authentication: {
          encryptionKey: login.encryptionKey,
          userToken: login.userToken,
        },
      });
      setCircleSdkReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [platformCircleWallet]);

  const isCircleMode = Boolean(
    circleLogin && circleWallet?.id && circleSdkReady && circleSdkRef.current,
  );

  async function authorize() {
    if (!address) return;
    if (social) {
      await load();
      return;
    }
    await signInWalletSession({
      ownerWallet: address,
      signMessage: async (message) => signMessageAsync({ message }),
    });
    await load();
  }

  async function executeCircleCall(
    callData: `0x${string}`,
    contractAddress: Address,
    refId: string,
  ) {
    if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
      throw new Error("Circle wallet confirmation is not ready.");
    }
    const challenge = await callCircleWalletApi<{ challengeId?: string }>(
      "createContractExecution",
      {
        callData,
        contractAddress,
        feeLevel: "MEDIUM",
        refId,
        userToken: circleLogin.userToken,
        walletId: circleWallet.id,
      },
    );
    if (!challenge.challengeId) {
      throw new Error("Circle did not return a transfer challenge.");
    }
    const sdk = circleSdkRef.current;
    sdk.setAuthentication({
      encryptionKey: circleLogin.encryptionKey,
      userToken: circleLogin.userToken,
    });
    return new Promise<{ txHash?: string; transactionId?: string }>(
      (resolve, reject) => {
        sdk.execute(challenge.challengeId!, (sdkError, result) => {
          if (sdkError) {
            reject(new Error(errorMessage(sdkError)));
            return;
          }
          resolve({
            txHash: extractCircleTxHash(result),
            transactionId: extractCircleTransactionId(result),
          });
        });
      },
    );
  }

  async function sendUnits(destination: Address, units: bigint) {
    if (chainId !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id });
    }
    const feeRecipient = platformFeeRecipient() as Address;
    const result = await executeBundledSend({
      chainId: arcTestnet.id,
      token: token.address,
      recipient: destination,
      paymentUnits: units,
      feeUnits: platformFeeUnits(units, SEND_FEE_BPS),
      feeRecipient,
      mode: isCircleMode ? "circle" : "external",
      writeContractAsync: isCircleMode
        ? undefined
        : async (args) =>
            writeContractAsync({
              address: args.address,
              abi: args.abi,
              functionName: args.functionName as "approve" | "send" | "transfer",
              args: args.args as never,
              chainId: args.chainId,
            }) as Promise<Hash>,
      circleExecutor: isCircleMode
        ? { execute: executeCircleCall }
        : undefined,
      readAllowance: publicClient
        ? async (spender) =>
            publicClient.readContract({
              abi: erc20Abi,
              address: token.address,
              args: [address as Address, spender],
              functionName: "allowance",
            })
        : undefined,
    });
    return result;
  }

  async function recoverSendHash(transactionId?: string) {
    if (!transactionId || !circleLogin || !circleWallet?.id) return null;
    return recoverCircleTxHash({
      transactionId,
      userToken: circleLogin.userToken,
      walletId: circleWallet.id,
    });
  }

  async function finishDeposit(input: {
    amountLabel: string;
    amountUnits: string;
    contributionId: string;
    pocketIdBytes32: Hex;
    pocketName?: string;
    pocketOwner: string;
    tokenAddress: Address;
    vaultAddress: Address;
  }) {
    const amount = BigInt(input.amountUnits);
    const owner = getAddress(input.pocketOwner);
    if (chainId !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id });
    }

    let txHash: `0x${string}` | undefined;
    let transactionId: string | undefined;

    if (isCircleMode) {
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [input.vaultAddress, amount],
      });
      await executeCircleCall(approveData, input.tokenAddress, "circle-save-approve");
      const depositData = encodeFunctionData({
        abi: swiftSaveVaultAbi,
        functionName: "depositFor",
        args: [owner, input.pocketIdBytes32, input.tokenAddress, amount],
      });
      const sent = await executeCircleCall(
        depositData,
        input.vaultAddress,
        "circle-save-deposit",
      );
      txHash = isOnchainTxHash(sent.txHash)
        ? (sent.txHash as `0x${string}`)
        : undefined;
      transactionId = sent.transactionId;
      if (!txHash) {
        const recovered = await recoverSendHash(sent.transactionId);
        if (isOnchainTxHash(recovered)) txHash = recovered as `0x${string}`;
      }
    } else {
      if (!publicClient) {
        throw new Error("Wallet RPC is not ready.");
      }
      const allowance = await publicClient.readContract({
        abi: erc20Abi,
        address: input.tokenAddress,
        args: [address as Address, input.vaultAddress],
        functionName: "allowance",
      });
      if (allowance < amount) {
        await writeContractAsync({
          abi: erc20Abi,
          address: input.tokenAddress,
          args: [input.vaultAddress, maxUint256],
          chainId: arcTestnet.id,
          functionName: "approve",
        });
      }
      txHash = await writeContractAsync({
        abi: swiftSaveVaultAbi,
        address: input.vaultAddress,
        args: [owner, input.pocketIdBytes32, input.tokenAddress, amount],
        chainId: arcTestnet.id,
        functionName: "depositFor",
      });
    }
    const dest = input.pocketName ? `"${input.pocketName}"` : "Circle Save";
    try {
      let result = await submitSave(
        circleId,
        address,
        {
          contributionId: input.contributionId,
          txHash,
          transactionId,
        },
        social,
      );
      if (
        result.contribution.status !== "confirmed" &&
        !result.contribution.tx_hash &&
        transactionId
      ) {
        const recovered = await recoverSendHash(transactionId);
        if (recovered) {
          result = await confirmSave(
            circleId,
            address,
            {
              contributionId: input.contributionId,
              txHash: recovered,
              transactionId,
            },
            social,
          );
        }
      }
      const credited =
        result.confirmed || result.contribution.status === "confirmed";
      showSuccess({
        amount: `${input.amountLabel} USDC`,
        eyebrow: "Circle Save",
        subtitle: credited
          ? `Deposited into ${dest}.`
          : `Sent to ${dest}. Circle Save will credit it once Arc confirms.`,
        title: credited ? "Deposit successful" : "Deposit submitted",
      });
    } catch (error) {
      console.error("[circle-save-deposit]", error);
      showSuccess({
        amount: `${input.amountLabel} USDC`,
        eyebrow: "Circle Save",
        subtitle: `Sent to ${dest}. Refresh Circle Save if the pocket does not update in a moment.`,
        title: "Deposit submitted",
      });
    }
  }

  async function executePocketWithdrawal(item: CircleWithdrawalProposalRecord) {
    const prepared = await postWithdrawalAction(
      item.id,
      address,
      { action: "execute" },
      social,
    );
    const call = prepared.vaultCall;
    if (!call) {
      return;
    }
    if (address !== call.owner.toLowerCase()) {
      throw new Error("Only the Circle host can withdraw from this Circle Save pocket.");
    }
    if (chainId !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id });
    }
    const amount = BigInt(call.amountUnits);
    const vault = call.vault as Address;
    const tokenAddress = call.token as Address;
    const pocketIdBytes32 = call.pocketIdBytes32 as Hex;
    if (publicClient) {
      await publicClient.simulateContract({
        account: getAddress(call.owner),
        address: vault,
        abi: swiftSaveVaultAbi,
        args: [pocketIdBytes32, tokenAddress, amount],
        functionName: "withdraw",
      });
    }
    let txHash: string | undefined;
    if (isCircleMode) {
      const withdrawData = encodeFunctionData({
        abi: swiftSaveVaultAbi,
        functionName: "withdraw",
        args: [pocketIdBytes32, tokenAddress, amount],
      });
      const sent = await executeCircleCall(
        withdrawData,
        vault,
        "circle-save-withdraw",
      );
      txHash = sent.txHash;
      if (!txHash) {
        const recovered = await recoverSendHash(sent.transactionId);
        if (recovered) txHash = recovered;
      }
    } else {
      txHash = await writeContractAsync({
        abi: swiftSaveVaultAbi,
        address: vault,
        args: [pocketIdBytes32, tokenAddress, amount],
        chainId: arcTestnet.id,
        functionName: "withdraw",
      });
    }
    if (call.needsForward) {
      const dest = getAddress(call.destination);
      if (isCircleMode) {
        const forwardData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [dest, amount],
        });
        await executeCircleCall(forwardData, tokenAddress, "circle-save-forward");
      } else {
        await writeContractAsync({
          abi: erc20Abi,
          address: tokenAddress,
          args: [dest, amount],
          chainId: arcTestnet.id,
          functionName: "transfer",
        });
      }
    }
    if (!txHash) {
      throw new Error("Pocket withdrawal did not return a transaction hash.");
    }
    try {
      await postWithdrawalAction(
        item.id,
        address,
        { action: "execute", txHash },
        social,
      );
    } catch (error) {
      console.error("[circle-save-withdraw-confirm]", error);
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    let failed: string | null = null;
    try {
      await fn();
      if (label) {
        showSuccess({
          eyebrow: "Circle",
          subtitle: label,
          title: "Task complete",
        });
      }
    } catch (err) {
      failed = errorMessage(err);
      setError(failed);
    } finally {
      setBusy(false);
      await load(failed ? { preserveError: failed } : undefined);
    }
  }

  useEffect(() => {
    if (tab === "chat") pinChatToBottomRef.current = true;
  }, [tab]);

  useEffect(() => {
    if (tab !== "chat") return;
    if (!pinChatToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const thread = chatThreadRef.current;
      if (!thread || !pinChatToBottomRef.current) return;
      thread.scrollTop = thread.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, tab]);

  const pendingMine = useMemo(
    () =>
      requests.filter(
        (item) => item.status === "pending" && item.target_user_wallet === address,
      ),
    [requests, address],
  );

  if (!address) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Connect a wallet to open this Circle.
      </p>
    );
  }

  if (loading && !circle) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Circle…
      </div>
    );
  }

  if (!circle) {
    return (
      <p className="text-sm text-destructive">{error ?? "Circle was not found."}</p>
    );
  }

  const activeMembers = members.filter((member) => member.status === "active");
  const searchableMembers = others.filter((member) => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return true;
    return `${memberLabel(member)} ${member.username ?? ""} ${member.user_wallet}`
      .toLowerCase()
      .includes(query);
  });

  async function sendChat() {
    if (!chatText.trim() || busy) return;
    const text = chatText;
    setChatText("");
    setBusy(true);
    setError(null);
    pinChatToBottomRef.current = true;
    try {
      await sendMessage(circleId, address, text, social);
      const latest = await fetchMessages(circleId, address, social);
      setMessages(latest.messages);
    } catch (err) {
      setChatText(text);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sc-room w-full min-w-0">
      <div className="section-panel min-w-0 sc-room-head">
        <div className="relative z-[1] grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
          <Link
            aria-label="Back to Circles"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border border-border bg-card text-muted-foreground hover:text-foreground"
            href="/swiftCircle"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 items-center gap-2.5">
            <CircleAvatar
              className="shrink-0"
              label={circle.name}
              size={40}
              src={circle.image_url}
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="sc-group-name truncate">
                  {circle.name}
                </h2>
                <Badge className="shrink-0" variant="secondary">{role}</Badge>
                {circle.financial_frozen ? (
                  <Badge className="shrink-0" variant="destructive">Frozen</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 hidden text-sm text-muted-foreground sm:line-clamp-1 sm:block">
                {circle.description || "Private group for chat, pay, requests, and shared Save."}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <div className="hidden min-w-0 sm:block">
                  <CircleAvatarStack
                    people={activeMembers.map((member) => ({
                      label: memberLabel(member),
                      src: member.avatar_url,
                      key: member.user_wallet,
                    }))}
                    size={22}
                  />
                </div>
                <span className="truncate text-xs font-semibold text-muted-foreground">
                  {activeCount} members
                </span>
              </div>
            </div>
          </div>
          <Button
            aria-label="Refresh"
            className="shrink-0"
            disabled={busy}
            onClick={() => void load()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Tabs
        className="sc-room-tabs flex w-full min-w-0 flex-col"
        onValueChange={setTab}
        value={tab}
      >
        <div className="sc-chip-nav" role="tablist">
          {(
            [
              ["chat", "Chat", MessageCircle],
              ["home", "Room", Home],
              ["pay", "Pay", Wallet],
              ["requests", "Requests", HandCoins],
              ["save", "Save", PiggyBank],
              ["members", "People", Users],
              ["activity", "Activity", Activity],
              ["settings", "Settings", Settings2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              aria-selected={tab === value}
              className="sc-chip"
              data-active={tab === value}
              key={value}
              onClick={() => setTab(value)}
              role="tab"
              type="button"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <TabsContent className="mt-4" value="home">
          <div className="sc-room-grid">
            <section className="sc-stat">
              <p className="kpi-label">Circle funds</p>
              <div className="mt-4">
                <button className="sc-stat w-full text-left" onClick={() => setTab("save")} type="button">
                  <p className="kpi-label">Circle Save</p>
                  <b>{formatUsd(save?.balance ?? "0")}</b>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {save?.goal_name || "Shared savings"}
                    {savePockets.length
                      ? ` · ${savePockets.filter((pocket) => pocket.status === "active").length} pockets`
                      : ""}
                  </p>
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => setTab("pay")}>Send money</Button>
                <Button onClick={() => setTab("requests")} variant="outline">
                  Request
                </Button>
                <Button onClick={() => setTab("chat")} variant="outline">
                  Open chat
                </Button>
              </div>
            </section>
            <section className="sc-stat">
              <p className="kpi-label">Needs attention</p>
              <div className="mt-3 grid gap-2">
                <button className="sc-list-row" onClick={() => setTab("requests")} type="button">
                  <CircleAvatar label="Requests" size={36} />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-semibold">Circle Requests</p>
                    <p className="text-xs text-muted-foreground">
                      {pendingMine.length} waiting on you
                    </p>
                  </div>
                  {pendingMine.length > 0 ? (
                    <span className="sc-unread">{pendingMine.length}</span>
                  ) : null}
                </button>
                <button className="sc-list-row" onClick={() => setTab("activity")} type="button">
                  <CircleAvatar label="Approvals" size={36} />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="font-semibold">Withdrawals</p>
                    <p className="text-xs text-muted-foreground">
                      {
                        withdrawals.filter((item) => item.status === "pending_approval")
                          .length
                      }{" "}
                      need approval
                    </p>
                  </div>
                </button>
              </div>
              <div className="mt-4 grid gap-2">
                {activity.slice(0, 4).map((item) => (
                  <p className="text-sm" key={item.id}>
                    <span className="text-muted-foreground">{clockLabel(item.created_at)} · </span>
                    {item.summary}
                  </p>
                ))}
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : null}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent className="sc-tab-chat mt-4" value="chat">
          <div className="sc-chat">
            <div
              className="sc-chat-thread"
              onScroll={(event) => {
                pinChatToBottomRef.current = isChatNearBottom(event.currentTarget);
              }}
              ref={chatThreadRef}
            >
              {messages.length === 0 ? (
                <div className="m-auto max-w-xs py-16 text-center">
                  <MessageCircle className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 font-heading text-lg font-semibold">Start the room</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Chat lives here. Payments, Save, and Earn show up as cards in the thread.
                  </p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const prev = messages[index - 1];
                  const mine = message.sender_user_wallet === address;
                  const label =
                    message.sender_display_name ||
                    (message.sender_username
                      ? `@${message.sender_username}`
                      : "Member");
                  const showDay =
                    !prev ||
                    dayLabel(prev.created_at) !== dayLabel(message.created_at);
                  const showName =
                    !mine &&
                    message.message_type === "text" &&
                    (!prev ||
                      prev.sender_user_wallet !== message.sender_user_wallet ||
                      prev.message_type !== "text");
                  if (message.message_type === "system") {
                    return (
                      <div key={message.id}>
                        {showDay ? (
                          <div className="sc-day-rule">
                            <span>{dayLabel(message.created_at)}</span>
                          </div>
                        ) : null}
                        <div className="sc-system">{message.content}</div>
                      </div>
                    );
                  }
                  if (message.message_type === "financial_card") {
                    return (
                      <div key={message.id}>
                        {showDay ? (
                          <div className="sc-day-rule">
                            <span>{dayLabel(message.created_at)}</span>
                          </div>
                        ) : null}
                        <div className="sc-money-card">
                          <CircleAvatar
                            label={label}
                            size={32}
                            src={message.sender_avatar_url}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-muted-foreground">
                              {label === "Member" ? "Circle" : label}
                            </p>
                            <strong>{message.content}</strong>
                            <span>{clockLabel(message.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={message.id}>
                      {showDay ? (
                        <div className="sc-day-rule">
                          <span>{dayLabel(message.created_at)}</span>
                        </div>
                      ) : null}
                      <div className={mine ? "sc-row sc-row-me" : "sc-row"}>
                        {!mine ? (
                          <CircleAvatar
                            label={label}
                            size={28}
                            src={message.sender_avatar_url}
                          />
                        ) : null}
                        <div className={mine ? "sc-bubble sc-bubble-me" : "sc-bubble sc-bubble-them"}>
                          {showName ? <p className="sc-bubble-name">{label}</p> : null}
                          <p>
                            {message.deleted_at
                              ? "This message was deleted."
                              : message.content}
                          </p>
                          <time>{clockLabel(message.created_at)}</time>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <form
              className="sc-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendChat();
              }}
            >
              <textarea
                onChange={(event) => setChatText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendChat();
                  }
                }}
                placeholder="Message the Circle…"
                rows={1}
                value={chatText}
              />
              <button className="sc-send" disabled={busy || !chatText.trim()} type="submit">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </TabsContent>

        <TabsContent className="mt-4 grid gap-4" value="pay">
          <section className="section-panel">
            <p className="section-eyebrow">Circle Pay</p>
            <h3 className="section-title">Send in the room</h3>
            <p className="section-copy">
              Select people, then pay. One recipient is a single send. Two or more go through BatchPay.
            </p>
            <div className="mt-4 flex justify-center">
              <span className="font-heading text-3xl font-bold text-muted-foreground">$</span>
              <input
                className="sc-amount"
                inputMode="decimal"
                onChange={(event) => setPayAmount(event.target.value)}
                placeholder={payMode === "everyone" || payMode === "equal_split" ? "0 each" : "0.00"}
                value={payAmount}
              />
            </div>
            <Input
              className="mx-auto mt-2 max-w-sm border-0 bg-transparent text-center shadow-none"
              onChange={(event) => setPayNote(event.target.value)}
              placeholder="What’s this for?"
              value={payNote}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(["pick", "everyone", "equal_split", "custom_split"] as const).map((mode) => (
                <button
                  className="sc-chip"
                  data-active={payMode === mode}
                  key={mode}
                  onClick={() => setPayMode(mode)}
                  type="button"
                >
                  {mode === "pick" ? "Members" : payModeLabel(mode)}
                </button>
              ))}
            </div>
            {payMode !== "everyone" ? (
              <div className="sc-picker mt-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Search username"
                    value={memberQuery}
                  />
                </div>
                <div className="sc-picker-grid">
                  {searchableMembers.map((member) => {
                    const selected = selectedRecipients.includes(member.user_wallet);
                    return (
                      <div className="flex flex-col items-center gap-1" key={member.user_wallet}>
                        <button
                          className="sc-person"
                          data-selected={selected}
                          onClick={() =>
                            setSelectedRecipients((current) =>
                              selected
                                ? current.filter((wallet) => wallet !== member.user_wallet)
                                : [...current, member.user_wallet],
                            )
                          }
                          type="button"
                        >
                          <CircleAvatar
                            label={memberLabel(member)}
                            size={28}
                            src={member.avatar_url}
                          />
                          <span>{memberLabel(member)}</span>
                        </button>
                        {payMode === "custom_split" && selected ? (
                          <Input
                            className="h-8 w-20 text-center"
                            onChange={(event) =>
                              setCustomAmounts((current) => ({
                                ...current,
                                [member.user_wallet]: event.target.value,
                              }))
                            }
                            placeholder="$"
                            value={customAmounts[member.user_wallet] ?? ""}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Everyone currently in the Circle will be paid when you confirm.
              </p>
            )}
            <Button
              className="mt-4"
              disabled={
                busy ||
                !payAmount ||
                (payMode !== "everyone" && selectedRecipients.length === 0)
              }
              onClick={() =>
                void run("Payment proposal ready", async () => {
                  const recipients =
                    payMode === "custom_split"
                      ? selectedRecipients.map((wallet) => ({
                          wallet,
                          amount: customAmounts[wallet],
                        }))
                      : selectedRecipients.map((wallet) => ({
                          wallet,
                          amount: payAmount,
                        }));
                  const mode =
                    payMode === "pick"
                      ? selectedRecipients.length > 1
                        ? "multiple"
                        : "individual"
                      : payMode;
                  const result = await createPayment(
                    circleId,
                    address,
                    {
                      mode,
                      total: mode === "everyone" ? undefined : payAmount,
                      everyoneAmount: mode === "everyone" ? payAmount : undefined,
                      recipients: mode === "everyone" ? undefined : recipients,
                      note: payNote,
                      idempotencyKey: crypto.randomUUID(),
                    },
                    social,
                  );
                  setReview(result as unknown as Record<string, unknown>);
                })
              }
            >
              Review payment
            </Button>
            {review ? (
              <div className="sc-receipt mt-5 text-sm">
                <p>
                  Total {String((review as { intent?: { total_amount?: string } }).intent?.total_amount)}{" "}
                  {circle.currency}
                </p>
                <p>Network/platform fee {String(review.feeAmount)}</p>
                <p>Final total {String(review.finalTotal)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(
                    (review.execution as { method?: string; recipientCount?: number } | undefined)
                      ?.method === "swiftbatch"
                      ? `SwiftBatch · ${(review.execution as { recipientCount?: number }).recipientCount} recipients`
                      : "Single payment",
                  )}
                </p>
                <ul className="mt-2 grid gap-1">
                  {((review.recipients as Array<{ username?: string; wallet: string; amount: string }>) ?? []).map(
                    (row) => (
                      <li key={row.wallet}>
                        {row.username ? `@${row.username}` : shortWallet(row.wallet)} · {formatUsd(row.amount)}
                      </li>
                    ),
                  )}
                </ul>
                <Button
                  className="mt-3"
                  disabled={busy}
                  onClick={() =>
                    void run("Payment submitted", async () => {
                      const intent = review.intent as { id: string };
                      const recs = (review.recipients as Array<{
                        wallet: string;
                        units: bigint | string;
                        amount: string;
                      }>) ?? [];
                      const execution = review.execution as {
                        method?: string;
                        contractAddress?: string | null;
                        callData?: string | null;
                        spender?: string | null;
                        requiredAllowanceUnits?: string;
                      } | undefined;
                      if (execution?.method === "swiftbatch") {
                        if (
                          !execution.contractAddress ||
                          !execution.callData ||
                          !execution.spender
                        ) {
                          throw new Error("SwiftBatch payload is missing.");
                        }
                        if (chainId !== arcTestnet.id) {
                          await switchChainAsync({ chainId: arcTestnet.id });
                        }
                        const spender = execution.spender as Address;
                        const required = BigInt(execution.requiredAllowanceUnits ?? "0");
                        const approveData = encodeFunctionData({
                          abi: erc20Abi,
                          functionName: "approve",
                          args: [spender, required],
                        });
                        let txHash: string | undefined;
                        let transactionId: string | undefined;
                        if (isCircleMode) {
                          await executeCircleCall(
                            approveData,
                            token.address,
                            "circle-pay-batch-approve",
                          );
                          const sent = await executeCircleCall(
                            execution.callData as Hex,
                            execution.contractAddress as Address,
                            "circle-pay-swiftbatch",
                          );
                          txHash = sent.txHash;
                          transactionId = sent.transactionId;
                        } else {
                          await writeContractAsync({
                            address: token.address,
                            abi: erc20Abi,
                            functionName: "approve",
                            args: [spender, required],
                            chainId: arcTestnet.id,
                          });
                          txHash = await sendTransactionAsync({
                            to: execution.contractAddress as Address,
                            data: execution.callData as Hex,
                            chainId: arcTestnet.id,
                          });
                        }
                        await submitPayment(
                          circleId,
                          address,
                          {
                            paymentId: intent.id,
                            txHash,
                            transactionId,
                            results: recs.map((row) => ({
                              recipientWallet: row.wallet,
                              txHash,
                              transactionId,
                            })),
                          },
                          social,
                        );
                      } else {
                        const row = recs[0];
                        if (!row) throw new Error("A recipient is required.");
                        const sent = await sendUnits(
                          row.wallet as Address,
                          BigInt(String(row.units)),
                        );
                        await submitPayment(
                          circleId,
                          address,
                          {
                            paymentId: intent.id,
                            results: [
                              {
                                recipientWallet: row.wallet,
                                txHash: sent.txHash,
                                transactionId: sent.transactionId,
                              },
                            ],
                          },
                          social,
                        );
                      }
                      setReview(null);
                      setPayAmount("");
                    })
                  }
                >
                  Confirm and send
                </Button>
              </div>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent className="mt-4 grid gap-4" value="requests">
          <section className="section-panel">
            <p className="section-eyebrow">Circle Requests</p>
            <h3 className="section-title">Ask the room</h3>
            <p className="section-copy">
              Request money from selected members or everyone in this Circle.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="sc-chip"
                data-active={requestMode === "pick"}
                onClick={() => setRequestMode("pick")}
                type="button"
              >
                Members
              </button>
              <button
                className="sc-chip"
                data-active={requestMode === "everyone"}
                onClick={() => setRequestMode("everyone")}
                type="button"
              >
                Everyone
              </button>
            </div>
            {requestMode === "pick" ? (
              <div className="sc-picker mt-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="Search username"
                    value={memberQuery}
                  />
                </div>
                <div className="sc-picker-grid">
                  {searchableMembers.map((member) => {
                    const selected = selectedRecipients.includes(member.user_wallet);
                    return (
                      <button
                        className="sc-person"
                        data-selected={selected}
                        key={member.user_wallet}
                        onClick={() =>
                          setSelectedRecipients((current) =>
                            selected
                              ? current.filter((wallet) => wallet !== member.user_wallet)
                              : [...current, member.user_wallet],
                          )
                        }
                        type="button"
                      >
                        <CircleAvatar
                          label={memberLabel(member)}
                          size={28}
                          src={member.avatar_url}
                        />
                        <span>{memberLabel(member)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                This request goes to everyone currently in the Circle.
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                onChange={(event) => setRequestAmount(event.target.value)}
                placeholder="Amount"
                value={requestAmount}
              />
              <Input
                onChange={(event) => setRequestReason(event.target.value)}
                placeholder="Reason"
                value={requestReason}
              />
            </div>
            <Button
              className="mt-3"
              disabled={
                busy ||
                !requestAmount ||
                (requestMode === "pick" && selectedRecipients.length === 0)
              }
              onClick={() =>
                void run("Request created", async () => {
                  const wallets = selectedRecipients;
                  await createPaymentRequest(
                    circleId,
                    address,
                    {
                      amount: requestAmount,
                      targetMode:
                        requestMode === "everyone"
                          ? "everyone"
                          : wallets.length > 1
                            ? "multiple"
                            : "one",
                      targetWallets: requestMode === "everyone" ? undefined : wallets,
                      reason: requestReason,
                      idempotencyKey: crypto.randomUUID(),
                    },
                    social,
                  );
                  setRequestAmount("");
                })
              }
            >
              Create request
            </Button>
          </section>
          {requestGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            requestGroups.map((group) => {
              const paid = group.paid_count ?? 0;
              const total = group.target_count ?? 0;
              const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
              return (
                <div className="sc-request-card" key={group.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="section-eyebrow">Open request</p>
                      <p className="mt-2 font-heading text-xl font-semibold">
                        {formatUsd(group.per_amount)} {group.asset}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {group.target_mode === "everyone" ? "From everyone" : "Selected people"}
                      </p>
                    </div>
                    <span className="sc-unread">{paid}/{total}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
          {pendingMine.map((item) => (
            <div
              className="sc-request-card"
              key={item.id}
            >
              <div>
                <p className="font-medium">
                  Pay {formatUsd(item.amount)} {item.asset}
                </p>
                <p className="text-sm text-muted-foreground">{item.reason ?? "Circle request"}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run("Request paid", async () => {
                      const proposal = await createPayment(
                        circleId,
                        address,
                        {
                          mode: "individual",
                          recipients: [
                            {
                              wallet: item.requester_user_wallet,
                              amount: item.amount,
                            },
                          ],
                          note: "Circle request payment",
                          idempotencyKey: crypto.randomUUID(),
                        },
                        social,
                      );
                      const rec = proposal.recipients[0];
                      const sent = await sendUnits(
                        rec.wallet as Address,
                        BigInt(String(rec.units)),
                      );
                      await submitPayment(
                        circleId,
                        address,
                        {
                          paymentId: proposal.intent.id,
                          results: [
                            {
                              recipientWallet: rec.wallet,
                              txHash: sent.txHash,
                              transactionId: sent.transactionId,
                            },
                          ],
                        },
                        social,
                      );
                      await respondPaymentRequest(
                        item.id,
                        address,
                        {
                          action: "pay",
                          paymentIntentId: proposal.intent.id,
                          txHash: sent.txHash,
                        },
                        social,
                      );
                    })
                  }
                  size="sm"
                >
                  Pay
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run("Request declined", async () => {
                      await respondPaymentRequest(
                        item.id,
                        address,
                        { action: "decline" },
                        social,
                      );
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent className="mt-4 grid gap-4" value="save">
          <section className="sc-stat">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="kpi-label">Circle Save</p>
                <h3 className="font-heading mt-1 text-xl font-semibold">
                  Shared pockets
                </h3>
              </div>
              {me?.role === "host" ? (
                <Button onClick={() => setCreatePocketOpen(true)} size="sm">
                  Create pocket
                </Button>
              ) : null}
            </div>
            <div className="mt-5">
              <div className="sc-ring" style={{ ["--p" as string]: saveProgress ?? 0 }}>
                <div>
                  <b className="font-heading text-lg">{formatUsd(save?.balance ?? "0")}</b>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    across {savePockets.filter((pocket) => pocket.status === "active").length} pockets
                  </p>
                </div>
              </div>
            </div>
            {!vaultAddress ? (
              <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
                Circle Save deposits are paused until SwiftSaveVault is configured.
              </p>
            ) : null}
            {savePockets.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {me?.role === "host"
                  ? "Create a flexible or fixed savings pocket so members can deposit toward this Circle’s goal."
                  : "Waiting for the host to create a savings pocket."}
              </p>
            ) : (
              <div className="mt-4 grid gap-2">
                {savePockets.map((pocket) => {
                  const lock = getPocketLockState(pocket);
                  const selected = pocket.id === selectedPocketId;
                  const pocketProgress = progressPercent(
                    parseUnits(pocket.current_balance_units),
                    pocket.target_amount_units
                      ? parseUnits(pocket.target_amount_units)
                      : null,
                  );
                  return (
                    <button
                      aria-pressed={selected}
                      className="sc-save-pocket"
                      data-selected={selected ? "true" : "false"}
                      key={pocket.id}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedPocketId(pocket.id);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <span className="text-xl">{getPocketEmoji(pocket.icon)}</span>
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {pocket.name}
                              {selected ? (
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-primary">
                                  Selected
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {pocket.lock_kind === "fixed"
                                ? lock.locked
                                  ? `Fixed · ${formatLockRemaining(lock.remainingMs)}`
                                  : "Fixed · unlocked"
                                : "Flexible · withdraw anytime"}
                              {pocket.status === "archived" ? " · archived" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <b>{formatUsd(pocket.current_balance)}</b>
                          {pocket.target_amount ? (
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              of {formatUsd(pocket.target_amount)}
                              {pocketProgress != null ? ` · ${pocketProgress}%` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Input
                className="max-w-40"
                onChange={(event) => setContributeAmount(event.target.value)}
                placeholder="Amount"
                value={contributeAmount}
              />
              <Button
                disabled={
                  busy ||
                  !contributeAmount ||
                  !vaultAddress ||
                  !selectedPocketId ||
                  savePockets.find((pocket) => pocket.id === selectedPocketId)?.status !==
                    "active"
                }
                onClick={() =>
                  void run("", async () => {
                    const pocket = savePockets.find((item) => item.id === selectedPocketId);
                    if (!pocket) {
                      throw new Error("Choose a savings pocket first.");
                    }
                    const proposed = await contributeSave(
                      circleId,
                      address,
                      {
                        amount: contributeAmount,
                        pocketId: pocket.id,
                        idempotencyKey: crypto.randomUUID(),
                      },
                      social,
                    );
                    await finishDeposit({
                      amountLabel: contributeAmount,
                      amountUnits: proposed.contribution.amount_units,
                      contributionId: proposed.contribution.id,
                      pocketIdBytes32: proposed.pocketIdBytes32 as Hex,
                      pocketName: pocket.name,
                      pocketOwner: proposed.pocketOwner,
                      tokenAddress: proposed.tokenAddress as Address,
                      vaultAddress: proposed.vaultAddress as Address,
                    });
                    setContributeAmount("");
                  })
                }
              >
                Deposit
              </Button>
            </div>

            {hasPermission(role, "initiate_withdrawal") ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Input
                  className="max-w-40"
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="Withdraw amount"
                  value={withdrawAmount}
                />
                <Button
                  disabled={
                    busy ||
                    !withdrawAmount ||
                    !selectedPocketId ||
                    Boolean(selectedPocketLock?.locked)
                  }
                  onClick={() =>
                    void run("Withdrawal proposed", async () => {
                      await createWithdrawal(
                        circleId,
                        address,
                        {
                          productType: "save",
                          pocketId: selectedPocketId,
                          amount: withdrawAmount,
                          destinationWallet: address,
                          destinationAddress: address,
                          confirm: true,
                          idempotencyKey: crypto.randomUUID(),
                        },
                        social,
                      );
                      setWithdrawAmount("");
                    })
                  }
                  variant="outline"
                >
                  Propose withdrawal
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Members can contribute, but cannot withdraw Circle Save funds.
              </p>
            )}
            {selectedPocketLock?.locked ? (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                This fixed pocket is locked. Members can still deposit. Withdrawals wait until it unlocks.
              </p>
            ) : null}
            {me?.role === "host" && selectedPocket?.status === "active" ? (
              <Button
                className="mt-3"
                disabled={busy}
                onClick={() =>
                  void run("Pocket archived", async () => {
                    await archiveCircleSavePocket(
                      circleId,
                      address,
                      selectedPocketId,
                      social,
                    );
                  })
                }
                size="sm"
                variant="ghost"
              >
                Archive selected pocket
              </Button>
            ) : null}
            {savePockets.some(
              (pocket) => pocket.status === "active" && pocket.id === selectedPocketId,
            ) ? null : (
              <p className="mt-4 text-sm text-muted-foreground">
                Select a pocket, enter an amount, and deposit. Confirmed deposits land in that pocket.
              </p>
            )}
            <CreateCirclePocketDialog
              circleId={circleId}
              circleSocialUuid={social}
              onCreated={(pocket) => {
                setSavePockets((current) => [...current, pocket]);
                setSelectedPocketId(pocket.id);
                toast.success(`Created ${pocket.lock_kind} pocket “${pocket.name}”`);
              }}
              onOpenChange={setCreatePocketOpen}
              open={createPocketOpen}
              ownerWallet={address}
            />
          </section>
        </TabsContent>

        <TabsContent className="mt-4" value="members">
          <section className="section-panel">
            <p className="section-eyebrow">People</p>
            <h3 className="section-title">
              {activeCount} / {limits?.max_members ?? 500}
            </h3>
            <p className="section-copy">
              Invite by username, then manage members in the board below.
            </p>
            <div className="mt-4 flex gap-2">
              <Input
                onChange={(event) => setInviteName(event.target.value)}
                placeholder="@username"
                value={inviteName}
              />
              <Button
                disabled={busy || !inviteName || !hasPermission(role, "invite")}
                onClick={() =>
                  void run("Invitation sent", async () => {
                    await inviteCircleMember(circleId, address, inviteName, social);
                    setInviteName("");
                  })
                }
              >
                Invite
              </Button>
            </div>
            <div className="sc-people-board mt-4">
            <div className="sc-people-grid">
          {members
            .filter((member) => member.status === "active")
            .map((member) => (
              <div
                className="sc-people-card"
                key={member.id}
              >
                <CircleAvatar
                  label={memberLabel(member)}
                  size={64}
                  src={member.avatar_url}
                />
                <div className="min-w-0">
                  <p className="font-medium">{memberLabel(member)}</p>
                  <p className="text-xs capitalize text-muted-foreground">{member.role}</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {hasPermission(role, "promote") && member.role === "member" ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run("Member promoted", async () => {
                          await postMemberAction(
                            circleId,
                            address,
                            { action: "promote", targetWallet: member.user_wallet },
                            social,
                          );
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      Promote
                    </Button>
                  ) : null}
                  {hasPermission(role, "demote") && member.role === "admin" ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run("Admin demoted", async () => {
                          await postMemberAction(
                            circleId,
                            address,
                            { action: "demote", targetWallet: member.user_wallet },
                            social,
                          );
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      Demote
                    </Button>
                  ) : null}
                  {hasPermission(role, "remove_member") && member.role !== "host" ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run("Member removed", async () => {
                          await postMemberAction(
                            circleId,
                            address,
                            { action: "remove", targetWallet: member.user_wallet },
                            social,
                          );
                        })
                      }
                      size="sm"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent className="mt-4 grid gap-4" value="activity">
          {withdrawals.length > 0 ? (
            <section className="sc-board sc-withdrawals-board">
              <div className="sc-board-head">
                <div>
                  <p className="kpi-label">Withdrawals</p>
                  <h3 className="font-heading mt-1 text-lg font-semibold">
                    Approvals and payouts
                  </h3>
                </div>
                <Badge variant="secondary">
                  {withdrawals.filter((item) =>
                    ["pending_approval", "approved", "executing"].includes(item.status),
                  ).length}{" "}
                  open
                </Badge>
              </div>
              <div className="sc-withdrawals-list mt-4">
                {[...withdrawals]
                  .sort((left, right) => {
                    const rank = (status: string) =>
                      status === "pending_approval"
                        ? 0
                        : status === "approved" || status === "executing"
                          ? 1
                          : status === "failed"
                            ? 2
                            : 3;
                    return rank(left.status) - rank(right.status);
                  })
                  .map((item) => {
                  const canRetryExecute =
                    Boolean(circle?.host_user_wallet) &&
                    address === circle.host_user_wallet.toLowerCase() &&
                    !item.tx_hash &&
                    (item.status === "approved" ||
                      item.status === "failed" ||
                      item.status === "executing");

                  return (
                    <div className="sc-withdrawal-card" key={item.id}>
                      <p className="font-medium">
                        {formatUsd(item.amount)} {item.asset} from Circle {item.product_type}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.status.replaceAll("_", " ")} · {item.required_approvals} approvals
                        required
                      </p>
                      {item.failure_reason ? (
                        <p className="mt-1 text-xs text-destructive">{item.failure_reason}</p>
                      ) : null}
                      {item.status === "pending_approval" &&
                      hasPermission(role, "approve_withdrawal") ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void run("Approved", async () => {
                                await postWithdrawalAction(
                                  item.id,
                                  address,
                                  { action: "approve" },
                                  social,
                                );
                              })
                            }
                            size="sm"
                          >
                            <Check className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void run("Rejected", async () => {
                                await postWithdrawalAction(
                                  item.id,
                                  address,
                                  { action: "reject" },
                                  social,
                                );
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                      {canRetryExecute ? (
                        <Button
                          className="mt-2"
                          disabled={busy}
                          onClick={() =>
                            void run("Pocket withdrawal submitted", async () => {
                              await executePocketWithdrawal(item);
                            })
                          }
                          size="sm"
                        >
                          {item.status === "approved" ? "Withdraw from pocket" : "Retry pocket withdraw"}
                        </Button>
                      ) : item.status === "approved" && !item.tx_hash ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Waiting for the Circle host to withdraw this from the Save pocket.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section className="sc-board">
            <div className="sc-board-head">
              <div>
                <p className="kpi-label">Activity</p>
                <h3 className="font-heading mt-1 text-lg font-semibold">Ledger of the room</h3>
              </div>
              <div className="flex min-w-[11rem] items-center gap-2 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <StyledSelect
                  ariaLabel="Filter Circle activity"
                  className="w-44"
                  onChange={setActivityFilter}
                  options={activityFilterOptions}
                  value={activityFilter}
                />
              </div>
            </div>
            <div className="sc-activity-list mt-4">
              {activity.filter((item) => {
                if (activityFilter === "all") return true;
                return item.activity_type.startsWith(activityFilter);
              }).length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                activity
                  .filter((item) => {
                    if (activityFilter === "all") return true;
                    return item.activity_type.startsWith(activityFilter);
                  })
                  .map((item) => (
                    <div className="sc-activity-row" key={item.id}>
                      <CircleAvatar
                        label={item.actor_user_wallet ?? circle.name}
                        size={36}
                        src={
                          members.find(
                            (member) =>
                              member.user_wallet === item.actor_user_wallet,
                          )?.avatar_url
                        }
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent className="mt-4 grid gap-4 overflow-visible" value="settings">
          <div className="sc-board">
            <h3 className="font-heading font-semibold">Circle profile</h3>
            <div className="mt-4 flex items-center gap-4">
              <CircleAvatar label={circle.name} size={72} src={circle.image_url} />
              {hasPermission(role, "edit_circle") ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-2 text-sm">
                  <Camera className="h-4 w-4" />
                  Update photo
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void run("Circle photo updated", async () => {
                        const imageUrl = await fileToCircleImage(file);
                        await updateCircleClient(
                          circleId,
                          address,
                          { imageUrl },
                          social,
                        );
                      });
                    }}
                    type="file"
                  />
                </label>
              ) : (
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold">{circle.name}</p>
                  <p className="text-sm capitalize text-muted-foreground">{role}</p>
                </div>
              )}
            </div>
            {hasPermission(role, "edit_circle") ? (
              <>
                <Input
                  className="mt-3"
                  onChange={(event) => setEditName(event.target.value)}
                  value={editName}
                />
                <Button
                  className="mt-3"
                  disabled={busy}
                  onClick={() =>
                    void run("Circle updated", async () => {
                      await updateCircleClient(
                        circleId,
                        address,
                        { name: editName },
                        social,
                      );
                    })
                  }
                >
                  Save name
                </Button>
              </>
            ) : null}
          </div>
          {hasPermission(role, "freeze") ? (
            <Button
              disabled={busy}
              onClick={() =>
                void run(circle.financial_frozen ? "Unfrozen" : "Frozen", async () => {
                  await postCircleAction(
                    circleId,
                    address,
                    { action: circle.financial_frozen ? "unfreeze" : "freeze" },
                    social,
                  );
                })
              }
              variant="outline"
            >
              {circle.financial_frozen ? "Unfreeze financial operations" : "Freeze financial operations"}
            </Button>
          ) : null}
          {hasPermission(role, "transfer_host") ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="font-medium">Transfer host</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                This is an explicit ownership transfer, not a role dropdown.
              </p>
              <div className="mt-3 grid gap-2">
                {others.map((member) => (
                  <Button
                    disabled={busy}
                    key={member.user_wallet}
                    onClick={() =>
                      void run("Host transferred", async () => {
                        await postCircleAction(
                          circleId,
                          address,
                          {
                            action: "transfer_host",
                            newHostWallet: member.user_wallet,
                            confirm: true,
                          },
                          social,
                        );
                      })
                    }
                    variant="outline"
                  >
                    Transfer to {memberLabel(member)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <Button
            disabled={busy || role === "host"}
            onClick={() =>
              void run("Left Circle", async () => {
                await postCircleAction(circleId, address, { action: "leave" }, social);
                window.location.href = "/swiftCircle";
              })
            }
            variant="outline"
          >
            Leave Circle
          </Button>
          {vaultAddress ? (
            <p className="text-xs text-muted-foreground">
              Circle Save pocket vault: {shortWallet(vaultAddress)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Circle Save deposits wait for SwiftSaveVault to be configured.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
