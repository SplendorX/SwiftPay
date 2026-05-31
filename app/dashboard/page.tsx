"use client";

import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  QrCode,
  ReceiptText,
  RefreshCw,
  Share2,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSignMessage,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
} from "viem";

import { BrandMark } from "@/components/brand-mark";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformNavDrawer } from "@/components/platform-nav-drawer";
import { PlatformPageBody } from "@/components/platform-page-body";
import { CircleFaucetLink } from "@/components/circle-faucet-link";
import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { ProfileMenu, type WalletMode } from "@/components/profile-menu";
import { TokenIcon } from "@/components/token-icon";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { type BeneficiaryRecord } from "@/lib/beneficiaries";
import {
  getArcScanHistoryUrls,
  normalizeArcScanTokenTransfers,
  type ArcScanTokenTransferResponse,
  type WalletTransfer,
} from "@/lib/arcscan-history";
import { erc20Abi } from "@/lib/contracts";
import {
  callCircleWalletApi,
  findCircleTokenBalance,
  readCircleLogin,
  readCircleWallets,
  type CircleClientErrorPayload,
  type CircleLoginResult,
  type CircleTokenBalance,
  type CircleWallet,
  writeCircleWallets,
} from "@/lib/circle-session";
import {
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";
import { recordPlatformPaymentEvent } from "@/lib/platform-analytics";
import { getSwapErrorMessage } from "@/lib/swap-errors";
import { arcTestnet } from "@/lib/wagmi";
import type { CircleSwapEstimate } from "@/swap/browser";

const fallbackAddress = "0x0000000000000000000000000000000000000000";
const sampleAddress = "0xA71CE15C5A0F4B9d7217B8A7A2E6d9D3F55A9cE1";
const zeroAmount = BigInt(0);

type BillPaymentOption = {
  description: string;
  id: string;
  title: string;
};

type CircleTransferChallenge = {
  challengeId?: string;
  id?: string;
};

type CircleChallengeResult = {
  data?: {
    id?: string;
    transactionId?: string;
    txHash?: string;
  };
  id?: string;
  status?: string;
  transactionId?: string;
};

const billPaymentOptions = [
  {
    description: "Mobile top-ups and data renewals.",
    id: "airtime",
    title: "Airtime and data",
  },
  {
    description: "Power, water, and utility payments.",
    id: "utilities",
    title: "Electricity and utilities",
  },
  {
    description: "Broadband, TV, and internet subscriptions.",
    id: "internet",
    title: "Internet and TV",
  },
  {
    description: "Rent, school fees, and scheduled invoices.",
    id: "invoice",
    title: "Rent or invoice",
  },
] satisfies BillPaymentOption[];

function shortenAddress(value?: string) {
  if (!value) {
    return "Not connected";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTokenAmount(
  amount: bigint | undefined,
  decimals: number,
  symbol: string,
) {
  if (amount === undefined) {
    return `Loading ${symbol}`;
  }

  return `${Number(formatUnits(amount, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })} ${symbol}`;
}

function formatDisplayAmount(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function formatTransferTime(value: string | null) {
  if (!value) {
    return "Indexed by ArcScan";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function getCounterpartyLabel(transfer: WalletTransfer) {
  if (transfer.counterparty.toLowerCase() === fallbackAddress) {
    return "Mint";
  }

  if (transfer.counterpartyIsContract) {
    if (transfer.method === "execute") {
      return "Swap route";
    }

    return "App action";
  }

  return shortenAddress(transfer.counterparty);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return getSwapErrorMessage(error.message.split("\n")[0] ?? error.message);
  }

  if (typeof error === "string") {
    return getSwapErrorMessage(error);
  }

  if (typeof error === "object" && error !== null) {
    const payload = error as CircleClientErrorPayload;
    const message = payload.message ?? payload.error;

    if (message) {
      const normalizedMessage = getSwapErrorMessage(message);

      return payload.code
        ? `[${payload.code}] ${normalizedMessage}`
        : normalizedMessage;
    }
  }

  return "Transaction failed. Check wallet details and try again.";
}

type ReceiptRow = {
  label: string;
  value: string;
};

function buildReceiptRows(
  transfer: WalletTransfer,
  walletAddress: string,
): ReceiptRow[] {
  const explorerUrl = `${arcTestnet.blockExplorers.default.url}/tx/${transfer.hash}`;
  const counterpartyLabel = transfer.direction === "out" ? "Recipient" : "Sender";

  return [
    { label: "Status", value: "Indexed on ArcScan" },
    { label: "Type", value: transfer.direction === "out" ? "Sent" : "Received" },
    {
      label: "Amount",
      value: `${formatDisplayAmount(transfer.amount)} ${transfer.symbol}`,
    },
    { label: "Wallet", value: walletAddress },
    { label: counterpartyLabel, value: transfer.counterparty },
    { label: "Counterparty", value: getCounterpartyLabel(transfer) },
    { label: "Transaction hash", value: transfer.hash },
    { label: "Block number", value: String(transfer.blockNumber) },
    { label: "Time", value: formatTransferTime(transfer.timestamp) },
    { label: "Explorer", value: explorerUrl },
  ];
}

function buildReceiptText(transfer: WalletTransfer, walletAddress: string) {
  return [
    "SwiftPay transaction receipt",
    ...buildReceiptRows(transfer, walletAddress).map(
      (row) => `${row.label}: ${row.value}`,
    ),
  ].join("\n");
}

function splitLongCanvasWord(
  context: CanvasRenderingContext2D,
  word: string,
  maxWidth: number,
) {
  const chunks: string[] = [];
  let chunk = "";

  for (const character of word) {
    const nextChunk = `${chunk}${character}`;

    if (chunk && context.measureText(nextChunk).width > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = nextChunk;
    }
  }

  if (chunk) {
    chunks.push(chunk);
  }

  return chunks;
}

function drawWrappedCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines: string[] = [];
  let currentLine = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const wordParts =
      context.measureText(word).width > maxWidth
        ? splitLongCanvasWord(context, word, maxWidth)
        : [word];

    for (const part of wordParts) {
      const nextLine = currentLine ? `${currentLine} ${part}` : part;

      if (currentLine && context.measureText(nextLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = part;
      } else {
        currentLine = nextLine;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  for (const line of lines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }

  return y;
}

function buildReceiptJpegDataUrl(
  transfer: WalletTransfer,
  walletAddress: string,
) {
  const width = 900;
  const height = 1180;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Receipt image could not be created.");
  }

  context.scale(scale, scale);
  context.fillStyle = "#fbf9ff";
  context.fillRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.58, "#f7f1ff");
  gradient.addColorStop(1, "#efe6ff");
  context.fillStyle = gradient;
  context.fillRect(32, 32, width - 64, height - 64);

  context.strokeStyle = "#e5d8ff";
  context.lineWidth = 2;
  context.strokeRect(32, 32, width - 64, height - 64);

  context.fillStyle = "#42118f";
  context.fillRect(58, 58, 64, 64);
  context.fillStyle = "#ffffff";
  context.font = "800 28px Manrope, Arial, sans-serif";
  context.fillText("SP", 71, 99);

  context.fillStyle = "#120b20";
  context.font = "700 34px Sora, Arial, sans-serif";
  context.fillText("SwiftPay", 145, 84);
  context.fillStyle = "#6a6079";
  context.font = "700 16px Manrope, Arial, sans-serif";
  context.fillText("Transaction receipt", 146, 112);

  context.fillStyle = "#120b20";
  context.font = "700 48px Sora, Arial, sans-serif";
  context.fillText(
    `${transfer.direction === "out" ? "-" : "+"}${formatDisplayAmount(
      transfer.amount,
    )} ${transfer.symbol}`,
    58,
    210,
  );

  context.fillStyle =
    transfer.direction === "out" ? "#be123c" : "#047857";
  context.font = "800 18px Manrope, Arial, sans-serif";
  context.fillText(
    transfer.direction === "out" ? "SENT" : "RECEIVED",
    60,
    248,
  );

  let y = 320;
  const labelX = 62;
  const valueX = 284;
  const valueWidth = width - valueX - 72;

  for (const row of buildReceiptRows(transfer, walletAddress)) {
    context.fillStyle = "#6a6079";
    context.font = "800 15px Manrope, Arial, sans-serif";
    context.fillText(row.label.toUpperCase(), labelX, y);

    context.fillStyle = "#120b20";
    context.font = "700 17px Manrope, Arial, sans-serif";
    const nextY = drawWrappedCanvasText(
      context,
      row.value,
      valueX,
      y,
      valueWidth,
      24,
    );

    context.strokeStyle = "#e5d8ff";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(58, nextY + 10);
    context.lineTo(width - 58, nextY + 10);
    context.stroke();

    y = nextY + 44;
  }

  context.fillStyle = "#6a6079";
  context.font = "700 14px Manrope, Arial, sans-serif";
  context.fillText("Generated by SwiftPay on Arc Testnet", 58, height - 76);

  return canvas.toDataURL("image/jpeg", 0.94);
}

function DashboardContent() {
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const {
    address: accountAddress,
    connector,
    isConnected: isAccountConnected,
  } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const { signMessageAsync, isPending: isSigningIn } = useSignMessage();
  const [isMounted, setIsMounted] = useState(false);
  const [activeAction, setActiveAction] = useState<"send" | "swap">("send");
  const [copied, setCopied] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ArcTokenSymbol>("USDC");
  const [selectedBillId, setSelectedBillId] = useState("internet");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("25.00");
  const [paymentNarration, setPaymentNarration] = useState(
    "Internet and TV bill payment",
  );
  const [transactionHash, setTransactionHash] = useState<Hash>();
  const [transactionLabel, setTransactionLabel] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Ready");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("25.00");
  const [receiveToken, setReceiveToken] = useState<ArcTokenSymbol>("USDC");
  const [paymentRequestCopied, setPaymentRequestCopied] = useState(false);
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [walletMode, setWalletMode] = useState<WalletMode>("circle");
  const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
  const [circleBalances, setCircleBalances] = useState<CircleTokenBalance[]>(
    [],
  );
  const [circleStatus, setCircleStatus] = useState("Circle wallet loading");
  const [circleError, setCircleError] = useState<string | null>(null);
  const [isCircleLoading, setIsCircleLoading] = useState(false);
  const [isCirclePaymentPending, setIsCirclePaymentPending] = useState(false);
  const [swapTokenIn, setSwapTokenIn] = useState<ArcTokenSymbol>("USDC");
  const [swapTokenOut, setSwapTokenOut] = useState<ArcTokenSymbol>("EURC");
  const [swapAmount, setSwapAmount] = useState("10.00");
  const [swapEstimate, setSwapEstimate] = useState<CircleSwapEstimate>();
  const [swapExplorerUrl, setSwapExplorerUrl] = useState<string>();
  const [swapStatus, setSwapStatus] = useState("Ready");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [isSwapEstimating, setIsSwapEstimating] = useState(false);
  const [isSwapPending, setIsSwapPending] = useState(false);
  const [walletTransfers, setWalletTransfers] = useState<WalletTransfer[]>([]);
  const [receiptTransfer, setReceiptTransfer] = useState<WalletTransfer | null>(
    null,
  );
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState<string | null>(null);
  const [savedBeneficiaries, setSavedBeneficiaries] = useState<
    BeneficiaryRecord[]
  >([]);
  const [authWallet, setAuthWallet] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isBeneficiariesLoading, setIsBeneficiariesLoading] = useState(false);
  const [isBeneficiarySaving, setIsBeneficiarySaving] = useState(false);
  const [beneficiaryStatus, setBeneficiaryStatus] = useState<string | null>(
    null,
  );
  const [beneficiaryError, setBeneficiaryError] = useState<string | null>(null);

  const externalAddress =
    isMounted && isAccountConnected ? accountAddress : undefined;
  const circleWallet = circleWallets[0];
  const circleAddress =
    circleWallet?.address && isAddress(circleWallet.address)
      ? (circleWallet.address as Address)
      : undefined;
  const isCircleWalletConnected = Boolean(circleLogin && circleAddress);
  const isEmbeddedWalletMode =
    walletMode === "circle" && isCircleWalletConnected;
  const isExternalWalletMode = walletMode === "external";
  const address = isEmbeddedWalletMode
    ? circleAddress
    : isExternalWalletMode
      ? externalAddress
      : undefined;
  const isConnected = Boolean(address);
  const walletAddress = address ?? sampleAddress;
  const fallbackAddressTyped = fallbackAddress as Address;
  const isArcNetwork =
    isEmbeddedWalletMode || (isExternalWalletMode && chainId === arcTestnet.id);
  const selectedTokenInfo = arcTestnetTokens[selectedToken];
  const selectedBillOption =
    billPaymentOptions.find((option) => option.id === selectedBillId) ??
    billPaymentOptions[0];
  const trimmedRecipientAddress = recipientAddress.trim();
  const trimmedPaymentNarration = paymentNarration.trim();
  const isRecipientValid = isAddress(trimmedRecipientAddress);
  const trimmedBeneficiaryName = beneficiaryName.trim().replace(/\s+/g, " ");
  const isWalletAuthenticated = Boolean(
    isEmbeddedWalletMode ||
      (address && authWallet && authWallet.toLowerCase() === address.toLowerCase()),
  );
  const isAuthenticatingWallet = isAuthLoading || isSigningIn;

  const {
    data: rawEurcBalance,
    isLoading: isEurcBalanceLoading,
    refetch: refetchEurcBalance,
  } = useReadContract({
    address: arcTestnetTokens.EURC.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? fallbackAddressTyped],
    chainId: arcTestnet.id,
    query: {
      enabled: Boolean(isConnected && address),
    },
  });

  const {
    data: rawUsdcBalance,
    isLoading: isUsdcBalanceLoading,
    refetch: refetchUsdcBalance,
  } = useReadContract({
    address: arcTestnetTokens.USDC.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? fallbackAddressTyped],
    chainId: arcTestnet.id,
    query: {
      enabled: Boolean(isConnected && address),
    },
  });

  const { data: nativeBalance } = useBalance({
    address,
    chainId: arcTestnet.id,
    query: {
      enabled: Boolean(isConnected && address),
    },
  });

  const { data: transactionReceipt, isLoading: isConfirming } =
    useWaitForTransactionReceipt({
      hash: transactionHash,
      chainId: arcTestnet.id,
      query: {
        enabled: Boolean(transactionHash),
      },
    });

  const tokenBalances = {
    EURC: typeof rawEurcBalance === "bigint" ? rawEurcBalance : undefined,
    USDC: typeof rawUsdcBalance === "bigint" ? rawUsdcBalance : undefined,
  } satisfies Record<ArcTokenSymbol, bigint | undefined>;

  const selectedTokenBalance = tokenBalances[selectedToken];
  const nativeBalanceText = nativeBalance
    ? `${Number(nativeBalance.formatted).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      })} ${nativeBalance.symbol}`
    : isConnected
      ? "Loading gas"
      : "Connect wallet";

  const paymentAmountUnits = useMemo(() => {
    if (!paymentAmount.trim()) {
      return null;
    }

    try {
      return parseUnits(paymentAmount, selectedTokenInfo.decimals);
    } catch {
      return null;
    }
  }, [paymentAmount, selectedTokenInfo.decimals]);

  const swapAmountUnits = useMemo(() => {
    if (!swapAmount.trim()) {
      return null;
    }

    try {
      return parseUnits(swapAmount, arcTestnetTokens[swapTokenIn].decimals);
    } catch {
      return null;
    }
  }, [swapAmount, swapTokenIn]);

  const hasEnoughTokenBalance = Boolean(
    paymentAmountUnits !== null &&
      selectedTokenBalance !== undefined &&
      selectedTokenBalance >= paymentAmountUnits,
  );
  const swapTokenBalance = tokenBalances[swapTokenIn];
  const hasEnoughSwapBalance = Boolean(
    swapAmountUnits !== null &&
      swapTokenBalance !== undefined &&
      swapTokenBalance >= swapAmountUnits,
  );
  const embeddedSwapWallet =
    circleLogin && circleWallet?.id && circleAddress
      ? {
          login: circleLogin,
          walletAddress: circleAddress,
          walletId: circleWallet.id,
        }
      : null;
  const canUseEmbeddedSwapWallet = Boolean(
    isEmbeddedWalletMode && embeddedSwapWallet,
  );
  const activeEmbeddedSwapWallet = isEmbeddedWalletMode
    ? embeddedSwapWallet
    : null;
  const canUseExternalSwapWallet = Boolean(
    !isEmbeddedWalletMode && externalAddress && connector,
  );
  const canUseSwapWallet = isEmbeddedWalletMode
    ? canUseEmbeddedSwapWallet
    : canUseExternalSwapWallet;
  const canRequestSwapQuote = Boolean(
    isConnected &&
      canUseSwapWallet &&
      isArcNetwork &&
      swapTokenIn !== swapTokenOut &&
      swapAmountUnits !== null &&
      swapAmountUnits > zeroAmount &&
      hasEnoughSwapBalance &&
      !isSwapEstimating &&
      !isSwapPending,
  );
  const canExecuteSwap = Boolean(canRequestSwapQuote && swapEstimate);
  const swapQuoteButtonText = !isConnected
    ? "Connect wallet"
    : !canUseSwapWallet
      ? isEmbeddedWalletMode
        ? "Circle wallet loading"
        : "Connect wallet"
      : !isArcNetwork
        ? "Switch network"
        : swapTokenIn === swapTokenOut
          ? "Choose assets"
          : swapAmountUnits === null || swapAmountUnits <= zeroAmount
            ? "Enter amount"
            : swapTokenBalance === undefined
              ? "Loading balance"
              : !hasEnoughSwapBalance
                ? `Insufficient ${swapTokenIn}`
                : "Get quote";
  const swapButtonText = !swapEstimate ? "Get quote first" : "Swap now";
  const canSubmitPayment = Boolean(
    isConnected &&
      isArcNetwork &&
      isRecipientValid &&
      paymentAmountUnits !== null &&
      paymentAmountUnits > zeroAmount &&
      hasEnoughTokenBalance &&
      !isCirclePaymentPending &&
      !isWritePending &&
      !isConfirming,
  );
  const canSaveBeneficiary = Boolean(
    isConnected &&
      !isEmbeddedWalletMode &&
      address &&
      isWalletAuthenticated &&
      isRecipientValid &&
      trimmedBeneficiaryName &&
      !isBeneficiarySaving,
  );
  const primaryButtonText = !isConnected
    ? "Connect wallet"
    : !isArcNetwork
      ? "Switch to Arc Testnet"
      : !isRecipientValid
        ? "Enter recipient"
        : paymentAmountUnits === null || paymentAmountUnits <= zeroAmount
          ? "Enter amount"
          : selectedTokenBalance === undefined
            ? "Loading balance"
            : !hasEnoughTokenBalance
              ? `Insufficient ${selectedToken}`
              : isEmbeddedWalletMode
                ? `Send with Circle wallet`
                : `Send ${selectedToken}`;
  const transactionExplorerUrl = transactionHash
    ? `${arcTestnet.blockExplorers.default.url}/tx/${transactionHash}`
    : undefined;
  const walletExplorerUrl = `${arcTestnet.blockExplorers.default.url}/address/${walletAddress}`;
  const paymentRequestUrl = useMemo(() => {
    if (!isMounted || typeof window === "undefined") {
      return "";
    }

    const requestUrl = new URL("/pay", window.location.origin);
    requestUrl.searchParams.set("to", walletAddress);
    requestUrl.searchParams.set("token", receiveToken);
    requestUrl.searchParams.set("chainId", String(arcTestnet.id));

    if (receiveAmount.trim()) {
      requestUrl.searchParams.set("amount", receiveAmount.trim());
    }

    return requestUrl.toString();
  }, [isMounted, receiveAmount, receiveToken, walletAddress]);
  const paymentNarrationSteps = useMemo(
    () => [
      selectedBillOption
        ? `${selectedBillOption.title} selected`
        : "Custom payment selected",
      isRecipientValid
        ? `Recipient ${shortenAddress(trimmedRecipientAddress)} is ready`
        : "Add the recipient wallet address",
      paymentAmountUnits !== null && paymentAmountUnits > zeroAmount
        ? `${formatDisplayAmount(paymentAmount)} ${selectedToken} prepared`
        : "Enter the payment amount",
      trimmedPaymentNarration
        ? `Receipt note: ${trimmedPaymentNarration}`
        : "Add a receipt note if needed",
    ],
    [
      isRecipientValid,
      paymentAmount,
      paymentAmountUnits,
      selectedBillOption,
      selectedToken,
      trimmedPaymentNarration,
      trimmedRecipientAddress,
    ],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreCircleWallet() {
      const login = readCircleLogin();

      if (!login) {
        setCircleStatus("No Circle wallet session");
        setCircleLogin(null);
        setCircleWallets([]);
        setCircleBalances([]);
        setWalletMode("external");
        return;
      }

      setCircleLogin(login);
      setWalletMode((currentMode) =>
        currentMode === "external" ? currentMode : "circle",
      );
      const cachedWallets = readCircleWallets();

      if (cachedWallets.length > 0) {
        setCircleWallets(cachedWallets);
        setCircleStatus("Circle wallet active");
      } else {
        setCircleStatus("Loading Circle wallet");
      }

      setIsCircleLoading(true);
      setCircleError(null);

      try {
        const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";

        if (appId) {
          const { W3SSdk: CircleW3SSdk } = await import(
            "@circle-fin/w3s-pw-web-sdk"
          );
          circleSdkRef.current = new CircleW3SSdk({
            appSettings: {
              appId,
            },
            authentication: {
              encryptionKey: login.encryptionKey,
              userToken: login.userToken,
            },
          });
        }

        const walletsPayload = await callCircleWalletApi<{
          wallets?: CircleWallet[];
        }>("listWallets", {
          userToken: login.userToken,
        });
        const wallets = walletsPayload.wallets ?? [];

        if (cancelled) {
          return;
        }

        setCircleWallets(wallets);
        writeCircleWallets(wallets);

        if (!wallets[0]) {
          setCircleStatus("Circle wallet not found");
          setCircleBalances([]);
          return;
        }

        const balancePayload = await callCircleWalletApi<{
          tokenBalances?: CircleTokenBalance[];
        }>("getTokenBalance", {
          userToken: login.userToken,
          walletId: wallets[0].id,
        });

        if (cancelled) {
          return;
        }

        setCircleBalances(balancePayload.tokenBalances ?? []);
        setCircleStatus("Circle wallet active");
      } catch (error) {
        if (!cancelled) {
          setCircleError(getErrorMessage(error));
          setCircleStatus("Circle wallet unavailable");
        }
      } finally {
        if (!cancelled) {
          setIsCircleLoading(false);
        }
      }
    }

    void restoreCircleWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRecipient = params.get("recipient") ?? params.get("to");
    const requestedAmount = params.get("amount");
    const requestedToken = params.get("token");
    const requestedMemo = params.get("memo");

    if (requestedRecipient && isAddress(requestedRecipient)) {
      setRecipientAddress(requestedRecipient);
    }

    if (requestedAmount) {
      setPaymentAmount(requestedAmount);
    }

    if (
      requestedToken &&
      arcTokenSymbols.includes(requestedToken as ArcTokenSymbol)
    ) {
      setSelectedToken(requestedToken as ArcTokenSymbol);
    }

    if (requestedMemo) {
      setPaymentNarration(requestedMemo);
    } else if (requestedRecipient || requestedAmount || requestedToken) {
      setPaymentNarration("Payment request link");
    }
  }, []);

  useEffect(() => {
    if (!transactionReceipt) {
      return;
    }

    if (transactionReceipt.status === "success") {
      setPaymentError(null);
      setPaymentStatus(`${transactionLabel} confirmed`);
      void refreshBalances();
      return;
    }

    setPaymentError(`${transactionLabel} reverted`);
  }, [
    transactionReceipt,
    transactionReceipt?.status,
    transactionReceipt?.transactionHash,
    transactionLabel,
  ]);

  useEffect(() => {
    if (!address) {
      setWalletTransfers([]);
      return;
    }

    const controller = new AbortController();
    const connectedAddress = address;

    async function loadDirectArcScanHistory() {
      const responses = await Promise.all(
        getArcScanHistoryUrls(connectedAddress).map((url) =>
          fetch(url, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ),
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("ArcScan history is unavailable.");
      }

      const payload = (await Promise.all(
        responses.map((response) => response.json()),
      )) as ArcScanTokenTransferResponse[];

      return normalizeArcScanTokenTransfers(connectedAddress, payload);
    }

    async function loadLocalArcScanHistory() {
      const response = await fetch(
        `/api/arcscan/history?address=${connectedAddress}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const payload = (await response.json()) as {
        items?: WalletTransfer[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to load wallet history.");
      }

      return payload.items ?? [];
    }

    async function loadTransfers() {
      setIsTransfersLoading(true);
      setTransfersError(null);

      try {
        try {
          setWalletTransfers(await loadDirectArcScanHistory());
        } catch (directError) {
          if (controller.signal.aborted) {
            return;
          }

          try {
            setWalletTransfers(await loadLocalArcScanHistory());
          } catch {
            throw directError;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setTransfersError(getErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) {
          setIsTransfersLoading(false);
        }
      }
    }

    void loadTransfers();

    return () => {
      controller.abort();
    };
  }, [address, swapExplorerUrl, transactionHash, transactionReceipt?.status]);

  useEffect(() => {
    if (!address || isEmbeddedWalletMode) {
      setAuthWallet(null);
      setIsAuthLoading(false);
      setBeneficiaryError(null);
      setBeneficiaryStatus(null);
      return;
    }

    const controller = new AbortController();
    const connectedAddress = address;

    async function loadWalletSession() {
      setIsAuthLoading(true);

      try {
        const response = await fetch("/api/auth/wallet", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          authenticated?: boolean;
          message?: string;
          ownerWallet?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to check wallet session.");
        }

        const ownerWallet = payload.ownerWallet;
        setAuthWallet(
          payload.authenticated &&
            ownerWallet?.toLowerCase() === connectedAddress.toLowerCase()
            ? ownerWallet
            : null,
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setAuthWallet(null);
          setBeneficiaryError(getErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsAuthLoading(false);
        }
      }
    }

    void loadWalletSession();

    return () => {
      controller.abort();
    };
  }, [address, isEmbeddedWalletMode]);

  useEffect(() => {
    if (!address || !isWalletAuthenticated || isEmbeddedWalletMode) {
      setSavedBeneficiaries([]);
      setIsBeneficiariesLoading(false);
      setBeneficiaryStatus(null);
      return;
    }

    const controller = new AbortController();

    async function loadBeneficiaries() {
      setIsBeneficiariesLoading(true);
      setBeneficiaryError(null);

      try {
        const response = await fetch("/api/beneficiaries", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          beneficiaries?: BeneficiaryRecord[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to load beneficiaries.");
        }

        setSavedBeneficiaries(payload.beneficiaries ?? []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setBeneficiaryError(getErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsBeneficiariesLoading(false);
        }
      }
    }

    void loadBeneficiaries();

    return () => {
      controller.abort();
    };
  }, [address, isEmbeddedWalletMode, isWalletAuthenticated]);

  async function refreshCircleWallet() {
    if (!circleLogin || !circleWallet) {
      return;
    }

    const balancePayload = await callCircleWalletApi<{
      tokenBalances?: CircleTokenBalance[];
    }>("getTokenBalance", {
      userToken: circleLogin.userToken,
      walletId: circleWallet.id,
    });

    setCircleBalances(balancePayload.tokenBalances ?? []);
  }

  async function refreshBalances() {
    await Promise.allSettled([refetchEurcBalance(), refetchUsdcBalance()]);
    await refreshCircleWallet();
  }

  async function refreshBalancesFromButton() {
    setPaymentError(null);
    setSwapError(null);
    await refreshBalances();
    setPaymentStatus("Balances refreshed");
  }

  async function ensureArcNetwork() {
    if (isArcNetwork) {
      return true;
    }

    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      setPaymentError(message);
      setSwapError(message);
      return false;
    }
  }

  function mergeSavedBeneficiary(beneficiary: BeneficiaryRecord) {
    setSavedBeneficiaries((current) => {
      const withoutExisting = current.filter(
        (item) =>
          item.beneficiary_wallet.toLowerCase() !==
          beneficiary.beneficiary_wallet.toLowerCase(),
      );

      return [...withoutExisting, beneficiary].sort((first, second) =>
        first.name.localeCompare(second.name),
      );
    });
  }

  async function handleWalletSignIn() {
    setBeneficiaryError(null);
    setBeneficiaryStatus(null);

    if (!isConnected || !address) {
      setBeneficiaryError("Connect a wallet before signing in.");
      return;
    }

    try {
      setIsAuthLoading(true);

      const ownerWallet = getAddress(address);
      const challengeResponse = await fetch("/api/auth/wallet", {
        body: JSON.stringify({
          action: "challenge",
          connectorName: connector?.name,
          ownerWallet,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const challengePayload = (await challengeResponse.json()) as {
        message?: string;
        signingMessage?: string;
      };

      if (!challengeResponse.ok || !challengePayload.signingMessage) {
        throw new Error(
          challengePayload.message ?? "Wallet sign-in could not start.",
        );
      }

      const signature = await signMessageAsync({
        message: challengePayload.signingMessage,
      });
      const verifyResponse = await fetch("/api/auth/wallet", {
        body: JSON.stringify({
          action: "verify",
          signature,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const verifyPayload = (await verifyResponse.json()) as {
        message?: string;
        ownerWallet?: string;
      };

      if (!verifyResponse.ok || !verifyPayload.ownerWallet) {
        throw new Error(verifyPayload.message ?? "Wallet sign-in failed.");
      }

      setAuthWallet(verifyPayload.ownerWallet);
      setBeneficiaryStatus("Wallet session ready");
    } catch (error) {
      setBeneficiaryError(getErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleSaveBeneficiary() {
    setBeneficiaryError(null);
    setBeneficiaryStatus(null);

    if (!isConnected || !address) {
      setBeneficiaryError("Connect a wallet before saving beneficiaries.");
      return;
    }

    if (!isWalletAuthenticated) {
      setBeneficiaryError("Sign in with your wallet once before saving.");
      return;
    }

    if (!isRecipientValid) {
      setBeneficiaryError("Enter a valid beneficiary wallet address.");
      return;
    }

    if (!trimmedBeneficiaryName) {
      setBeneficiaryError("Enter a beneficiary name.");
      return;
    }

    try {
      setIsBeneficiarySaving(true);

      const beneficiaryWallet = getAddress(trimmedRecipientAddress);
      const response = await fetch("/api/beneficiaries", {
        body: JSON.stringify({
          beneficiaryWallet,
          name: trimmedBeneficiaryName,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        beneficiary?: BeneficiaryRecord;
        message?: string;
      };

      if (!response.ok || !payload.beneficiary) {
        throw new Error(payload.message ?? "Beneficiary could not be saved.");
      }

      mergeSavedBeneficiary(payload.beneficiary);
      setBeneficiaryStatus(`${trimmedBeneficiaryName} saved`);
    } catch (error) {
      setBeneficiaryError(getErrorMessage(error));
    } finally {
      setIsBeneficiarySaving(false);
    }
  }

  function handleBillPaymentSelect(option: BillPaymentOption) {
    setSelectedBillId(option.id);
    setPaymentNarration(`${option.title} payment`);
    setPaymentStatus(`${option.title} selected`);
    setPaymentError(null);
  }

  async function handleCirclePaymentAction() {
    if (!circleLogin || !circleWallet?.id || !circleAddress) {
      setPaymentError("Circle wallet is not ready.");
      return;
    }

    if (!circleSdkRef.current) {
      setPaymentError("Circle wallet confirmation is not ready.");
      return;
    }

    if (!isRecipientValid) {
      setPaymentError("Enter a valid recipient wallet address.");
      return;
    }

    if (paymentAmountUnits === null || paymentAmountUnits <= zeroAmount) {
      setPaymentError("Enter a valid amount.");
      return;
    }

    const tokenBalance = findCircleTokenBalance(circleBalances, selectedToken);

    try {
      setIsCirclePaymentPending(true);
      setPaymentStatus("Preparing Circle wallet transfer");

      const challenge = await callCircleWalletApi<CircleTransferChallenge>(
        "createTransfer",
        {
          amount: paymentAmount.trim(),
          blockchain: circleWallet.blockchain ?? "ARC-TESTNET",
          destinationAddress: trimmedRecipientAddress,
          feeLevel: "MEDIUM",
          refId: trimmedPaymentNarration.slice(0, 50) || undefined,
          tokenAddress: selectedTokenInfo.address,
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
      setPaymentStatus("Confirm transfer in Circle wallet");

      circleSdkRef.current.execute(challenge.challengeId, (error, result) => {
        setIsCirclePaymentPending(false);

        if (error) {
          setPaymentError(getErrorMessage(error));
          setPaymentStatus("Circle transfer cancelled");
          return;
        }

        const challengeResult = result as CircleChallengeResult | undefined;
        const txHash = challengeResult?.data?.txHash;

        setPaymentError(null);
        setTransactionLabel(
          trimmedPaymentNarration
            ? `${trimmedPaymentNarration} to ${shortenAddress(trimmedRecipientAddress)}`
            : `Payment to ${shortenAddress(trimmedRecipientAddress)}`,
        );

        if (txHash) {
          setTransactionHash(txHash as Hash);
          setPaymentStatus(`${selectedToken} payment submitted`);
          recordPlatformPaymentEvent({
            amount: paymentAmount.trim(),
            counterpartyAddress: trimmedRecipientAddress,
            eventType: "direct_send",
            metadata: {
              narration: trimmedPaymentNarration,
              walletMode: "circle",
            },
            token: selectedToken,
            txHash,
            walletAddress: circleAddress,
          });
        } else {
          setPaymentStatus("Circle payment confirmed");
          recordPlatformPaymentEvent({
            amount: paymentAmount.trim(),
            counterpartyAddress: trimmedRecipientAddress,
            eventType: "direct_send",
            metadata: {
              narration: trimmedPaymentNarration,
              walletMode: "circle",
            },
            token: selectedToken,
            walletAddress: circleAddress,
          });
          void refreshBalances();
        }
      });
    } catch (error) {
      setIsCirclePaymentPending(false);
      setPaymentError(getErrorMessage(error));
      setPaymentStatus("Circle transfer failed");
    }
  }

  async function handlePaymentAction() {
    setPaymentError(null);

    if (!isConnected || !address) {
      setPaymentError("Connect with Google or an external wallet before sending.");
      return;
    }

    if (isEmbeddedWalletMode) {
      await handleCirclePaymentAction();
      return;
    }

    if (!(await ensureArcNetwork())) {
      return;
    }

    if (!isRecipientValid) {
      setPaymentError("Enter a valid recipient wallet address.");
      return;
    }

    if (paymentAmountUnits === null || paymentAmountUnits <= zeroAmount) {
      setPaymentError("Enter a valid amount.");
      return;
    }

    if (!hasEnoughTokenBalance) {
      setPaymentError(`Insufficient ${selectedToken} balance.`);
      return;
    }

    try {
      const hash = await writeContractAsync({
        address: selectedTokenInfo.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [trimmedRecipientAddress as Address, paymentAmountUnits],
        chainId: arcTestnet.id,
      });

      setTransactionHash(hash);
      recordPlatformPaymentEvent({
        amount: paymentAmount.trim(),
        counterpartyAddress: trimmedRecipientAddress,
        eventType: "direct_send",
        metadata: {
          narration: trimmedPaymentNarration,
          walletMode: "external",
        },
        token: selectedToken,
        txHash: hash,
        walletAddress: address,
      });
      setTransactionLabel(
        trimmedPaymentNarration
          ? `${trimmedPaymentNarration} to ${shortenAddress(trimmedRecipientAddress)}`
          : `Payment to ${shortenAddress(trimmedRecipientAddress)}`,
      );
      setPaymentStatus(`${selectedToken} payment submitted`);
    } catch (error) {
      setPaymentError(getErrorMessage(error));
    }
  }

  async function executeCircleChallenge(challengeId: string, label?: string) {
    const sdk = circleSdkRef.current;

    if (!circleLogin || !sdk) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    sdk.setAuthentication({
      encryptionKey: circleLogin.encryptionKey,
      userToken: circleLogin.userToken,
    });

    if (label) {
      setSwapStatus(`Confirm ${label} in Circle wallet`);
    }

    return new Promise<{ transactionId?: string; txHash?: string }>(
      (resolve, reject) => {
      sdk.execute(challengeId, (error, result) => {
        if (error) {
          reject(new Error(getErrorMessage(error)));
          return;
        }

        const challengeResult = result as CircleChallengeResult | undefined;
        resolve({
          transactionId:
            challengeResult?.data?.transactionId ??
            challengeResult?.transactionId ??
            challengeResult?.data?.id ??
            challengeResult?.id,
          txHash: challengeResult?.data?.txHash,
        });
      });
      },
    );
  }

  async function handleEstimateSwap() {
    setSwapError(null);
    setSwapEstimate(undefined);
    setSwapExplorerUrl(undefined);

    if (isEmbeddedWalletMode && !activeEmbeddedSwapWallet) {
      setSwapError("Circle wallet is not ready.");
      return;
    }

    if (!isEmbeddedWalletMode && (!isConnected || !connector)) {
      setSwapError("Connect a wallet before swapping.");
      return;
    }

    if (!(await ensureArcNetwork())) {
      return;
    }

    if (!swapAmount.trim() || Number(swapAmount) <= 0) {
      setSwapError("Enter a valid swap amount.");
      return;
    }

    if (swapAmountUnits === null || swapAmountUnits <= zeroAmount) {
      setSwapError("Enter a valid swap amount.");
      return;
    }

    if (swapTokenIn === swapTokenOut) {
      setSwapError("Choose two different assets.");
      return;
    }

    if (!hasEnoughSwapBalance) {
      setSwapError(`Insufficient ${swapTokenIn} balance.`);
      return;
    }

    try {
      setIsSwapEstimating(true);
      const { estimateCircleSwap, estimateCircleUserWalletSwap } =
        await import("@/swap/browser");
      const estimate = activeEmbeddedSwapWallet
        ? await estimateCircleUserWalletSwap({
            amountIn: swapAmount,
            executeChallenge: executeCircleChallenge,
            onStatus: setSwapStatus,
            slippageBps: 100,
            tokenIn: swapTokenIn,
            tokenOut: swapTokenOut,
            userToken: activeEmbeddedSwapWallet.login.userToken,
            walletAddress: activeEmbeddedSwapWallet.walletAddress,
            walletId: activeEmbeddedSwapWallet.walletId,
          })
        : await estimateCircleSwap({
            amountIn: swapAmount,
            connector,
            slippageBps: 100,
            tokenIn: swapTokenIn,
            tokenOut: swapTokenOut,
          });
      setSwapEstimate(estimate);
      setSwapStatus("Quote ready");
    } catch (error) {
      setSwapError(getErrorMessage(error));
    } finally {
      setIsSwapEstimating(false);
    }
  }

  async function handleExecuteSwap() {
    setSwapError(null);

    if (isEmbeddedWalletMode && !activeEmbeddedSwapWallet) {
      setSwapError("Circle wallet is not ready.");
      return;
    }

    if (!isEmbeddedWalletMode && (!isConnected || !connector)) {
      setSwapError("Connect a wallet before swapping.");
      return;
    }

    if (!(await ensureArcNetwork())) {
      return;
    }

    if (swapAmountUnits === null || swapAmountUnits <= zeroAmount) {
      setSwapError("Enter a valid swap amount.");
      return;
    }

    if (swapTokenIn === swapTokenOut) {
      setSwapError("Choose two different assets.");
      return;
    }

    if (!hasEnoughSwapBalance) {
      setSwapError(`Insufficient ${swapTokenIn} balance.`);
      return;
    }

    if (!swapEstimate) {
      setSwapError("Get a quote before swapping.");
      return;
    }

    try {
      setIsSwapPending(true);
      setSwapStatus(
        activeEmbeddedSwapWallet
          ? "Preparing Circle wallet swap"
          : "Confirm swap in external wallet",
      );
      const { executeCircleSwap, executeCircleUserWalletSwap } =
        await import("@/swap/browser");
      const result = activeEmbeddedSwapWallet
        ? await executeCircleUserWalletSwap({
            amountIn: swapAmount,
            executeChallenge: executeCircleChallenge,
            onStatus: setSwapStatus,
            slippageBps: 100,
            stopLimit: swapEstimate.stopLimitAmount,
            tokenIn: swapTokenIn,
            tokenOut: swapTokenOut,
            userToken: activeEmbeddedSwapWallet.login.userToken,
            walletAddress: activeEmbeddedSwapWallet.walletAddress,
            walletId: activeEmbeddedSwapWallet.walletId,
          })
        : await executeCircleSwap({
            amountIn: swapAmount,
            connector,
            slippageBps: 100,
            stopLimit: swapEstimate.stopLimitAmount,
            tokenIn: swapTokenIn,
            tokenOut: swapTokenOut,
          });
      setSwapExplorerUrl(
        result.explorerUrl ??
          `${arcTestnet.blockExplorers.default.url}/tx/${result.txHash}`,
      );
      setSwapStatus(
        result.amountOut
          ? `Received ${result.amountOut} ${swapTokenOut}`
          : "Swap submitted",
      );
      recordPlatformPaymentEvent({
        amount: swapAmount,
        eventType: "swap",
        metadata: {
          amountOut: result.amountOut,
          tokenOut: swapTokenOut,
          walletMode: activeEmbeddedSwapWallet ? "circle" : "external",
        },
        token: swapTokenIn,
        txHash: result.txHash,
        walletAddress,
      });
      setSwapEstimate(undefined);
      await refreshBalances();
    } catch (error) {
      setSwapError(getErrorMessage(error));
    } finally {
      setIsSwapPending(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  async function copyPaymentRequest() {
    if (!paymentRequestUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(paymentRequestUrl);
      setPaymentRequestCopied(true);
      window.setTimeout(() => setPaymentRequestCopied(false), 1400);
    } catch {
      setPaymentRequestCopied(false);
    }
  }

  function downloadReceipt(transfer: WalletTransfer) {
    try {
      const receiptUrl = buildReceiptJpegDataUrl(transfer, walletAddress);
      const anchor = document.createElement("a");
      anchor.href = receiptUrl;
      anchor.download = `swiftpay-receipt-${transfer.hash.slice(0, 12)}.jpg`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      setTransfersError(getErrorMessage(error));
    }
  }

  async function shareReceipt(transfer: WalletTransfer) {
    const receipt = buildReceiptText(transfer, walletAddress);
    const explorerUrl = `${arcTestnet.blockExplorers.default.url}/tx/${transfer.hash}`;

    try {
      if (navigator.share) {
        await navigator.share({
          text: receipt,
          title: "SwiftPay transaction receipt",
          url: explorerUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(receipt);
      setPaymentStatus("Receipt copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setTransfersError(getErrorMessage(error));
    }
  }

  function flipSwapTokens() {
    setSwapTokenIn(swapTokenOut);
    setSwapTokenOut(swapTokenIn);
    setSwapEstimate(undefined);
  }

  function handleCircleSessionCleared() {
    circleSdkRef.current = null;
    setCircleLogin(null);
    setCircleWallets([]);
    setCircleBalances([]);
    setCircleError(null);
    setCircleStatus("No Circle wallet session");
    setWalletMode("circle");
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-0 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex w-full max-w-none flex-col gap-4">
        <header className="surface-panel sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link className="flex min-w-0 items-center gap-3 justify-self-start" href="/">
            <BrandMark className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="truncate text-sm font-semibold text-muted sm:text-base">
                Move stablecoins instantly onchain.
              </p>
            </div>
          </Link>

          <div className="flex min-w-0 items-center gap-2 justify-self-start lg:justify-self-end">
            <a
              className="hidden h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0 sm:inline-flex"
              href="#activity"
            >
              <ReceiptText className="h-4 w-4" />
              View activity
            </a>
            <CircleFaucetLink />
            <ProfileMenu
              circleLogin={circleLogin}
              circleWalletAddress={circleAddress}
              externalAddress={externalAddress}
              externalWalletAction={<WalletConnectButton />}
              onCircleSessionCleared={handleCircleSessionCleared}
              onWalletModeChange={setWalletMode}
              walletMode={walletMode}
            />
            <PlatformNavDrawer />
          </div>
        </header>

        <PlatformPageBody>
        <section className="surface-panel p-4 sm:p-5">
          <div className="mb-5">
            <p className="eyebrow">Balances</p>
            <h1 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
              Your funds, ready
            </h1>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {(["USDC", "EURC"] as const).map((symbol) => {
              const token = arcTestnetTokens[symbol];
              const balance = tokenBalances[symbol];

              return (
                <button
                  className={`surface-card min-h-[15rem] p-4 text-left transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_18px_38px_rgba(66,17,143,0.10)] ${
                    selectedToken === symbol ? "ring-2 ring-swift-600/20" : ""
                  }`}
                  key={symbol}
                  onClick={() => setSelectedToken(symbol)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <TokenIcon
                        className="h-12 w-12 shrink-0 rounded-full shadow-sm"
                        symbol={symbol}
                      />
                      <div className="min-w-0">
                        <p className="eyebrow text-[0.68rem]">{symbol}</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                          {isConnected
                            ? token.name
                            : "Connect your wallet to see this balance"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`soft-pill ${
                        selectedToken === symbol ? "soft-pill-live" : ""
                      }`}
                    >
                      {selectedToken === symbol ? "Active" : "Select"}
                    </span>
                  </div>

                  <p className="mt-8 font-heading text-3xl font-semibold tracking-normal text-ink sm:text-4xl">
                    {isConnected
                      ? formatTokenAmount(balance, token.decimals, symbol)
                      : "Nothing here yet"}
                  </p>
                  <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-muted">
                    {symbol} balance - Arc Testnet
                  </p>

                  <div className="field-shell mt-4 flex items-center justify-between gap-3 px-3 py-3 text-sm">
                    <span className="font-semibold text-muted">Status</span>
                    <span className="rounded-full bg-lavender-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-muted">
                      {isConnected ? "Loaded" : "Connect"}
                    </span>
                  </div>
                </button>
              );
            })}

            <article className="surface-card min-h-[15rem] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-[0.68rem]">
                    {isEmbeddedWalletMode ? "Circle wallet" : "Network funds"}
                  </p>
                  <h2 className="mt-6 font-heading text-3xl font-semibold tracking-normal text-ink">
                    {nativeBalanceText}
                  </h2>
                </div>
                <span className="soft-pill soft-pill-live">
                  {isEmbeddedWalletMode ? "Circle" : "Live"}
                </span>
              </div>
              <p className="mt-6 max-w-sm text-sm leading-6 text-muted">
                {isEmbeddedWalletMode
                  ? circleError ?? circleStatus
                  : "Gas and stablecoin balances stay separate so payments remain easy to scan before signing."}
              </p>

              <div className="mt-7 flex max-w-full items-center gap-2 rounded-lg border border-lavender-200 bg-white/70 px-3 py-2.5">
                <Wallet className="h-4 w-4 shrink-0 text-swift-600" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-ink">
                  {shortenAddress(walletAddress)}
                </span>
                <button
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-lavender-100 px-2 text-xs font-black text-muted transition hover:bg-white hover:text-swift-700"
                  onClick={copyAddress}
                  type="button"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {isCircleLoading ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-2 text-sm font-semibold text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Circle wallet
                </div>
              ) : null}
            </article>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
          <div className="surface-panel p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">Send</p>
                <h1 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink sm:text-2xl">
                  Send money
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Select a payment type, add a receipt note, then confirm.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-lavender-200 bg-white/80 text-swift-700 transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
                  onClick={refreshBalancesFromButton}
                  type="button"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      isEurcBalanceLoading || isUsdcBalanceLoading
                        ? "animate-spin"
                        : ""
                    }`}
                  />
                </button>
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
                  href={`/pay?to=${encodeURIComponent(walletAddress)}`}
                >
                  <QrCode className="h-4 w-4 text-swift-600" />
                  Receive
                </Link>
              </div>
            </div>

            <div className="mb-5 rounded-lg border border-lavender-200 bg-white/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              <span className="font-ui text-sm font-bold text-ink">
                Send payment
              </span>
            </div>

              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePaymentAction();
                }}
              >
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-ink">
                    Recipient wallet
                  </span>
                  <div className="flex h-12 items-center gap-2 rounded-lg border border-lavender-200/90 bg-white/80 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition focus-within:border-swift-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-swift-600/15">
                    <Wallet className="h-4 w-4 text-swift-600" />
                    <input
                      autoComplete="off"
                      className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-ink outline-none placeholder:text-muted"
                      onChange={(event) =>
                        setRecipientAddress(event.target.value)
                      }
                      placeholder="0x recipient address"
                      spellCheck={false}
                      value={recipientAddress}
                    />
                  </div>
                </label>

                <div className="grid gap-3 rounded-lg border border-lavender-200/90 bg-white/90 p-4 shadow-[0_10px_24px_rgba(32,72,121,0.06)] ring-1 ring-white/80">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-ink">
                        Beneficiary name
                      </span>
                      <div className="flex h-12 items-center gap-2 rounded-lg border border-lavender-200/90 bg-white/80 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition focus-within:border-swift-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-swift-600/15">
                        <Users className="h-4 w-4 text-swift-600" />
                        <input
                          autoComplete="off"
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted"
                          maxLength={80}
                          onChange={(event) =>
                            setBeneficiaryName(event.target.value)
                          }
                          placeholder="Name this wallet"
                          value={beneficiaryName}
                        />
                      </div>
                    </label>

                    <button
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-4 text-sm font-bold text-swift-700 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0 disabled:cursor-not-allowed disabled:border-lavender-200 disabled:bg-white disabled:text-muted disabled:shadow-none"
                      disabled={!canSaveBeneficiary}
                      onClick={handleSaveBeneficiary}
                      type="button"
                    >
                      {isBeneficiarySaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      {!isConnected
                        ? "Connect wallet"
                        : isEmbeddedWalletMode
                          ? "Circle wallet active"
                          : !isWalletAuthenticated
                          ? "Sign in first"
                          : "Save beneficiary"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lavender-100 bg-lavender-50/75 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.80)]">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-muted">
                      {isWalletAuthenticated ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <KeyRound className="h-4 w-4 shrink-0 text-swift-600" />
                      )}
                      <span className="min-w-0 truncate">
                        {isEmbeddedWalletMode
                          ? `Circle wallet active: ${shortenAddress(walletAddress)}`
                          : isWalletAuthenticated
                            ? `Wallet session active: ${shortenAddress(authWallet ?? undefined)}`
                          : isConnected
                            ? "Wallet session required"
                            : "Connect wallet"}
                      </span>
                    </div>

                    {isConnected && !isWalletAuthenticated && !isEmbeddedWalletMode ? (
                      <button
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-swift-600 px-3 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300"
                        disabled={isAuthenticatingWallet}
                        onClick={handleWalletSignIn}
                        type="button"
                      >
                        {isAuthenticatingWallet ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5" />
                        )}
                        Sign in
                      </button>
                    ) : null}
                  </div>

                  {beneficiaryError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        {beneficiaryError}
                      </span>
                    </div>
                  ) : beneficiaryStatus ? (
                    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        {beneficiaryStatus}
                      </span>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                        Saved beneficiaries
                      </span>
                      {isBeneficiariesLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-swift-600" />
                      ) : null}
                    </div>

                    {isEmbeddedWalletMode ? (
                      <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-2 text-sm font-semibold text-muted">
                        Circle wallet payments can use any recipient address.
                      </div>
                    ) : !isConnected ? (
                      <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-2 text-sm font-semibold text-muted">
                        Connect wallet to load beneficiaries.
                      </div>
                    ) : !isWalletAuthenticated ? (
                      <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-2 text-sm font-semibold text-muted">
                        Wallet session required.
                      </div>
                    ) : isBeneficiariesLoading ? (
                      <div className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-2 text-sm font-semibold text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading beneficiaries
                      </div>
                    ) : savedBeneficiaries.length === 0 ? (
                      <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-2 text-sm font-semibold text-muted">
                        No saved beneficiaries yet.
                      </div>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {savedBeneficiaries.map((beneficiary) => (
                          <button
                            className="min-w-[12rem] rounded-lg border border-lavender-100 bg-white/80 px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white hover:shadow-[0_10px_22px_rgba(66,17,143,0.10)]"
                            key={`${beneficiary.owner_wallet}-${beneficiary.beneficiary_wallet}`}
                            onClick={() => {
                              setBeneficiaryName(beneficiary.name);
                              setRecipientAddress(
                                beneficiary.beneficiary_wallet,
                              );
                              setBeneficiaryError(null);
                              setBeneficiaryStatus(null);
                            }}
                            type="button"
                          >
                            <span className="block truncate text-sm font-bold text-ink">
                              {beneficiary.name}
                            </span>
                            <span className="block font-mono text-xs font-semibold text-muted">
                              {shortenAddress(beneficiary.beneficiary_wallet)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">
                      Amount
                    </span>
                    <div className="flex h-12 items-center gap-2 rounded-lg border border-lavender-200/90 bg-white/80 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition focus-within:border-swift-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-swift-600/15">
                      <TokenIcon
                        className="h-5 w-5 shrink-0 rounded-full"
                        symbol={selectedToken}
                      />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted"
                        inputMode="decimal"
                        onChange={(event) =>
                          setPaymentAmount(event.target.value)
                        }
                        placeholder="0.00"
                        value={paymentAmount}
                      />
                    </div>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">
                      Asset
                    </span>
                    <select
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) =>
                        setSelectedToken(event.target.value as ArcTokenSymbol)
                      }
                      value={selectedToken}
                    >
                      {arcTokenSymbols.map((symbol) => (
                        <option key={symbol} value={symbol}>
                          {symbol}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">
                      Narration
                    </span>
                    <span className="text-xs font-bold text-muted">
                      {selectedBillOption.title}
                    </span>
                  </div>
                  <div className="rounded-lg border border-lavender-200/90 bg-white/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition focus-within:border-swift-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-swift-600/15">
                    <textarea
                      className="min-h-24 w-full resize-none bg-transparent text-sm font-medium leading-6 text-ink outline-none placeholder:text-muted"
                      maxLength={140}
                      onChange={(event) =>
                        setPaymentNarration(event.target.value)
                      }
                      placeholder="Type your payment note or choose a bill option below"
                      value={paymentNarration}
                    />
                    <div className="mt-3 border-t border-lavender-100 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
                          Bill options
                        </span>
                        <span className="text-xs font-semibold text-muted">
                          Scroll to select
                        </span>
                      </div>
                      <div className="grid max-h-36 gap-2 overflow-y-auto pr-1">
                        {billPaymentOptions.map((option) => {
                          const isSelected = selectedBillId === option.id;

                          return (
                            <button
                              className={`rounded-lg border px-3 py-2 text-left transition hover:border-swift-600 hover:bg-white ${
                                isSelected
                                  ? "border-swift-600 bg-lavender-50 text-swift-700"
                                  : "border-lavender-100 bg-white/60 text-ink"
                              }`}
                              key={option.id}
                              onClick={() => handleBillPaymentSelect(option)}
                              type="button"
                            >
                              <span className="block text-sm font-bold">
                                {option.title}
                              </span>
                              <span className="mt-1 block text-xs font-semibold leading-5 text-muted">
                                {option.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-lavender-200/90 bg-white/75 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">Bill</span>
                    <span className="text-right font-bold text-ink">
                      {selectedBillOption.title}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">From</span>
                    <span className="font-mono text-xs font-bold text-ink">
                      {shortenAddress(address)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">To</span>
                    <span className="font-mono text-xs font-bold text-ink">
                      {isRecipientValid
                        ? shortenAddress(trimmedRecipientAddress)
                        : "Waiting for address"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-muted">Narration</span>
                    <span className="max-w-[16rem] text-right font-bold text-ink">
                      {trimmedPaymentNarration || "No note added"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">Status</span>
                    <span className="text-right font-bold text-swift-700">
                      {paymentStatus}
                    </span>
                  </div>
                </div>

                {paymentError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{paymentError}</span>
                  </div>
                ) : null}

                {transactionExplorerUrl ? (
                  <a
                    className="inline-flex items-center gap-2 text-sm font-bold text-swift-700 transition hover:text-swift-600"
                    href={transactionExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View transaction on ArcScan
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}

                <button
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
                  disabled={
                    isWritePending ||
                    isConfirming ||
                    isCirclePaymentPending ||
                    isSwitchingChain ||
                    (isConnected && isArcNetwork && !canSubmitPayment)
                  }
                  type="submit"
                >
                  {isWritePending ||
                  isConfirming ||
                  isCirclePaymentPending ||
                  isSwitchingChain ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {isConfirming || isCirclePaymentPending
                    ? "Confirming"
                    : primaryButtonText}
                </button>
              </form>
          </div>

          <div className="grid gap-4">
            <div className="surface-panel p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">Insights</p>
                  <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
                    Payment notes
                  </h2>
                </div>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-4 text-xs font-black text-white shadow-[0_12px_26px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 active:translate-y-0"
                  onClick={refreshBalancesFromButton}
                  type="button"
                >
                  Refresh
                </button>
              </div>

              <p className="text-sm leading-6 text-muted">
                Live narration for the payment currently being prepared.
              </p>

              <div className="mt-5 grid gap-2 rounded-lg border border-dashed border-lavender-200 bg-white/60 px-4 py-4">
                {paymentNarrationSteps.map((step, index) => (
                  <div
                    className="grid grid-cols-[auto_1fr] items-start gap-3"
                    key={step}
                  >
                    <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-black text-swift-700 shadow-sm">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold leading-6 text-muted">
                      {step}
                    </span>
                  </div>
                ))}
                <p className="mt-2 text-sm leading-6 text-muted">
                  Gas balance: {nativeBalanceText}. Recent transfers indexed:{" "}
                  {walletTransfers.length}.
                </p>
              </div>
            </div>

            <div
              className="surface-panel min-h-0 p-4 sm:p-5"
              id="activity"
            >
              <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
                <div className="min-w-0">
                  <p className="eyebrow">Activity</p>
                  <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink sm:text-2xl">
                    Wallet transactions
                  </h2>
                </div>
                <ReceiptText className="h-5 w-5 shrink-0 text-swift-600" />
              </div>
              <div className="grid max-h-[20rem] gap-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[24rem] lg:max-h-[27rem]">
                {!isConnected ? (
                  <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-4 py-4 text-sm font-semibold text-muted">
                    Connect a wallet to load transactions.
                  </div>
                ) : isTransfersLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-lavender-100 bg-lavender-50 px-4 py-4 text-sm font-semibold text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading wallet transactions
                  </div>
                ) : transfersError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">
                      {transfersError}
                    </span>
                  </div>
                ) : walletTransfers.length === 0 ? (
                  <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-4 py-4 text-sm font-semibold text-muted">
                    No recent USDC or EURC transfers found.
                  </div>
                ) : (
                  walletTransfers.map((transfer) => (
                    <article
                      className="grid gap-3 rounded-lg border border-lavender-100 bg-white/90 px-3 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_10px_22px_rgba(66,17,143,0.08)] sm:grid-cols-[minmax(0,1fr)_auto] sm:px-4"
                      key={`${transfer.hash}-${transfer.symbol}-${transfer.direction}-${transfer.logIndex}`}
                    >
                      <div className="min-w-0">
                        <p className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-bold text-ink">
                          <TokenIcon
                            className="h-4 w-4 shrink-0 rounded-full"
                            symbol={transfer.symbol}
                          />
                          <span className="truncate">
                            {transfer.direction === "out" ? "Sent" : "Received"}{" "}
                            {transfer.symbol}
                          </span>
                        </p>
                        <p className="truncate text-xs font-medium text-muted">
                          {transfer.direction === "out" ? "To" : "From"}{" "}
                          {getCounterpartyLabel(transfer)} -{" "}
                          {formatTransferTime(transfer.timestamp)}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-lavender-100 bg-white px-2 text-xs font-bold text-ink transition hover:border-swift-600 hover:text-swift-700"
                            onClick={() => setReceiptTransfer(transfer)}
                            type="button"
                          >
                            <ReceiptText className="h-3.5 w-3.5" />
                            Receipt
                          </button>
                          <button
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-lavender-100 bg-white px-2 text-xs font-bold text-ink transition hover:border-swift-600 hover:text-swift-700"
                            onClick={() => downloadReceipt(transfer)}
                            type="button"
                          >
                            <Download className="h-3.5 w-3.5" />
                            JPEG
                          </button>
                          <button
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-lavender-100 bg-white px-2 text-xs font-bold text-ink transition hover:border-swift-600 hover:text-swift-700"
                            onClick={() => void shareReceipt(transfer)}
                            type="button"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            Share
                          </button>
                          <a
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-lavender-50 px-2 text-xs font-bold text-swift-700 transition hover:bg-swift-700 hover:text-white"
                            href={`${arcTestnet.blockExplorers.default.url}/tx/${transfer.hash}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            ArcScan
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-3 sm:block sm:text-right">
                        <p
                          className={`min-w-0 truncate text-sm font-bold ${
                            transfer.direction === "out"
                              ? "text-rose-600"
                              : "text-emerald-700"
                          }`}
                        >
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <TokenIcon
                              className="h-4 w-4 shrink-0 rounded-full"
                              symbol={transfer.symbol}
                            />
                            <span>
                              {transfer.direction === "out" ? "-" : "+"}
                              {formatDisplayAmount(transfer.amount)}{" "}
                              {transfer.symbol}
                            </span>
                          </span>
                        </p>
                        <p className="shrink-0 text-xs font-bold text-muted">
                          Block {transfer.blockNumber}
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted">Gas balance: {nativeBalanceText}</span>
                <a
                  className="inline-flex items-center gap-2 font-bold text-swift-700 transition hover:text-swift-600"
                  href={walletExplorerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Wallet on ArcScan
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </section>
        </PlatformPageBody>
      </div>

      {receiptTransfer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-swift-700/40 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-white/80 bg-gradient-to-br from-white via-white to-lavender-50 p-5 shadow-[0_28px_90px_rgba(18,11,32,0.28)] ring-1 ring-white/75">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="font-ui text-sm font-semibold text-swift-700">
                  Transaction receipt
                </p>
                <h2 className="font-heading text-2xl font-semibold tracking-normal text-ink">
                  {receiptTransfer.direction === "out" ? "Sent" : "Received"}{" "}
                  {receiptTransfer.symbol}
                </h2>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-lavender-200 bg-white text-ink transition hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0"
                onClick={() => setReceiptTransfer(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-lavender-200 bg-white/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-xl font-semibold tracking-normal text-ink">
                    SwiftPay
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-muted">
                    Arc Testnet receipt
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
                    receiptTransfer.direction === "out"
                      ? "bg-rose-50 text-rose-600"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {receiptTransfer.direction === "out" ? "Sent" : "Received"}
                </span>
              </div>

              <p
                className={`font-heading text-3xl font-semibold tracking-normal ${
                  receiptTransfer.direction === "out"
                    ? "text-rose-600"
                    : "text-emerald-700"
                }`}
              >
                {receiptTransfer.direction === "out" ? "-" : "+"}
                {formatDisplayAmount(receiptTransfer.amount)}{" "}
                {receiptTransfer.symbol}
              </p>

              <div className="mt-5 grid gap-3">
                {buildReceiptRows(receiptTransfer, walletAddress).map((row) => (
                  <div
                    className="grid gap-1 border-t border-lavender-100 pt-3 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3"
                    key={row.label}
                  >
                    <span className="font-bold text-muted">{row.label}</span>
                    <span className="min-w-0 break-words font-semibold text-ink sm:text-right">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                onClick={() => downloadReceipt(receiptTransfer)}
                type="button"
              >
                <Download className="h-4 w-4" />
                JPEG
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-4 text-sm font-bold text-ink transition hover:-translate-y-0.5 hover:border-swift-600 hover:text-swift-700 active:translate-y-0"
                onClick={() => void shareReceipt(receiptTransfer)}
                type="button"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <a
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-4 text-sm font-bold text-ink transition hover:-translate-y-0.5 hover:border-swift-600 hover:text-swift-700 active:translate-y-0"
                href={`${arcTestnet.blockExplorers.default.url}/tx/${receiptTransfer.hash}`}
                rel="noreferrer"
                target="_blank"
              >
                ArcScan
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {receiveOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-swift-700/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-white/80 bg-gradient-to-br from-white via-white to-lavender-50 p-5 shadow-[0_28px_90px_rgba(18,11,32,0.28)] ring-1 ring-white/75">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="font-ui text-sm font-semibold text-swift-700">
                  Receive payment
                </p>
                <h2 className="font-heading text-2xl font-semibold tracking-normal text-ink">
                  Payment link
                </h2>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-lavender-200 bg-white text-ink transition hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0"
                onClick={() => setReceiveOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-ink">Amount</span>
                <input
                  className="h-11 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                  inputMode="decimal"
                  onChange={(event) => setReceiveAmount(event.target.value)}
                  placeholder="0.00"
                  value={receiveAmount}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-ink">Asset</span>
                <select
                  className="h-11 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                  onChange={(event) =>
                    setReceiveToken(event.target.value as ArcTokenSymbol)
                  }
                  value={receiveToken}
                >
                  {arcTokenSymbols.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <LazyQRCodeSVG
                  bgColor="#ffffff"
                  fgColor="#160f24"
                  marginSize={1}
                  size={220}
                  title="SwiftPay payment request"
                  value={
                    paymentRequestUrl ||
                    `ethereum:${walletAddress}@${arcTestnet.id}`
                  }
                />
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
              <p className="mb-3 break-all text-xs font-bold leading-5 text-swift-700">
                {paymentRequestUrl || "Payment link will be generated here."}
              </p>
              <p className="truncate font-mono text-sm font-bold text-ink">
                {walletAddress}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(66,17,143,0.18)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                  onClick={copyAddress}
                  type="button"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "Copied" : "Address"}
                </button>
                <button
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                  onClick={copyPaymentRequest}
                  type="button"
                >
                  {paymentRequestCopied ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {paymentRequestCopied ? "Copied" : "Link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function Dashboard() {
  return (
    <PlatformAccessGate>
      <DashboardContent />
    </PlatformAccessGate>
  );
}
