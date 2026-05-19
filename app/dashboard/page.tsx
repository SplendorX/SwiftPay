"use client";

import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  QrCode,
  ReceiptText,
  RefreshCw,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
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
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";
import {
  estimateCircleSwap,
  executeCircleSwap,
  type CircleSwapEstimate,
} from "@/swap/browser";

const fallbackAddress = "0x0000000000000000000000000000000000000000";
const sampleAddress = "0xA71CE15C5A0F4B9d7217B8A7A2E6d9D3F55A9cE1";
const zeroAmount = BigInt(0);

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
    return error.message.split("\n")[0] ?? error.message;
  }

  return "Transaction failed. Check wallet details and try again.";
}

export default function Dashboard() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const { signMessageAsync, isPending: isSigningIn } = useSignMessage();
  const [activeAction, setActiveAction] = useState<"send" | "swap">("send");
  const [copied, setCopied] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ArcTokenSymbol>("USDC");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("25.00");
  const [transactionHash, setTransactionHash] = useState<Hash>();
  const [transactionLabel, setTransactionLabel] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Ready");
  const [paymentError, setPaymentError] = useState<string | null>(null);
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

  const walletAddress = address ?? sampleAddress;
  const fallbackAddressTyped = fallbackAddress as Address;
  const isArcNetwork = chainId === arcTestnet.id;
  const selectedTokenInfo = arcTestnetTokens[selectedToken];
  const trimmedRecipientAddress = recipientAddress.trim();
  const isRecipientValid = isAddress(trimmedRecipientAddress);
  const trimmedBeneficiaryName = beneficiaryName.trim().replace(/\s+/g, " ");
  const isWalletAuthenticated = Boolean(
    address && authWallet && authWallet.toLowerCase() === address.toLowerCase(),
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
  const canRequestSwapQuote = Boolean(
    isConnected &&
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
      !isWritePending &&
      !isConfirming,
  );
  const canSaveBeneficiary = Boolean(
    isConnected &&
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
              : `Send ${selectedToken}`;
  const transactionExplorerUrl = transactionHash
    ? `${arcTestnet.blockExplorers.default.url}/tx/${transactionHash}`
    : undefined;
  const walletExplorerUrl = `${arcTestnet.blockExplorers.default.url}/address/${walletAddress}`;

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
    if (!address) {
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
  }, [address]);

  useEffect(() => {
    if (!address || !isWalletAuthenticated) {
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
  }, [address, isWalletAuthenticated]);

  async function refreshBalances() {
    await Promise.allSettled([refetchEurcBalance(), refetchUsdcBalance()]);
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

  async function handlePaymentAction() {
    setPaymentError(null);

    if (!isConnected || !address) {
      setPaymentError("Connect a wallet before sending.");
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
      setTransactionLabel(`Payment to ${shortenAddress(trimmedRecipientAddress)}`);
      setPaymentStatus(`${selectedToken} payment submitted`);
    } catch (error) {
      setPaymentError(getErrorMessage(error));
    }
  }

  async function handleEstimateSwap() {
    setSwapError(null);
    setSwapEstimate(undefined);
    setSwapExplorerUrl(undefined);

    if (!isConnected || !connector) {
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
      const estimate = await estimateCircleSwap({
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

    if (!isConnected || !connector) {
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
      const result = await executeCircleSwap({
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

  function flipSwapTokens() {
    setSwapTokenIn(swapTokenOut);
    setSwapTokenOut(swapTokenIn);
    setSwapEstimate(undefined);
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="surface-panel sticky top-3 z-20 flex items-center justify-between px-3 py-2 sm:px-4">
          <Link className="flex min-w-0 items-center gap-3" href="/">
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

          <div className="flex items-center gap-2">
            <a
              className="hidden h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0 sm:inline-flex"
              href="#activity"
            >
              <ReceiptText className="h-4 w-4" />
              View activity
            </a>
            <WalletConnectButton />
          </div>
        </header>

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
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-base font-black text-ink shadow-sm">
                        {symbol === "USDC" ? "$" : "E"}
                      </span>
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
                  <p className="eyebrow text-[0.68rem]">Network funds</p>
                  <h2 className="mt-6 font-heading text-3xl font-semibold tracking-normal text-ink">
                    {nativeBalanceText}
                  </h2>
                </div>
                <span className="soft-pill soft-pill-live">Live</span>
              </div>
              <p className="mt-6 max-w-sm text-sm leading-6 text-muted">
                Gas and stablecoin balances stay separate so payments remain
                easy to scan before signing.
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
            </article>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_30rem]">
          <div className="surface-panel p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">
                  {activeAction === "send" ? "Send" : "Swap"}
                </p>
                <h1 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink sm:text-2xl">
                  {activeAction === "send" ? "Send money" : "Convert balances"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {activeAction === "send"
                    ? "Recipient, amount, then confirm."
                    : "Choose the asset pair, quote, then execute."}
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
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
                  onClick={() => setReceiveOpen(true)}
                  type="button"
                >
                  <QrCode className="h-4 w-4 text-swift-600" />
                  Receive
                </button>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-lg border border-lavender-200 bg-white/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              {(["send", "swap"] as const).map((action) => (
                <button
                  className={`font-ui h-10 rounded-md text-sm font-semibold transition ${
                    activeAction === action
                      ? "bg-white text-ink shadow-sm ring-1 ring-lavender-100"
                      : "text-muted hover:bg-white/70 hover:text-ink"
                  }`}
                  key={action}
                  onClick={() => setActiveAction(action)}
                  type="button"
                >
                  {action === "send" ? "Send" : "Swap"}
                </button>
              ))}
            </div>

            {activeAction === "send" ? (
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
                        {isWalletAuthenticated
                          ? `Wallet session active: ${shortenAddress(authWallet ?? undefined)}`
                          : isConnected
                            ? "Wallet session required"
                            : "Connect wallet"}
                      </span>
                    </div>

                    {isConnected && !isWalletAuthenticated ? (
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

                    {!isConnected ? (
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
                      <CircleDollarSign className="h-4 w-4 text-swift-600" />
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

                <div className="grid gap-2 rounded-lg border border-lavender-200/90 bg-white/75 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
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
                    isSwitchingChain ||
                    (isConnected && isArcNetwork && !canSubmitPayment)
                  }
                  type="submit"
                >
                  {isWritePending || isConfirming || isSwitchingChain ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {isConfirming ? "Confirming" : primaryButtonText}
                </button>
              </form>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">From</span>
                    <select
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) => {
                        const next = event.target.value as ArcTokenSymbol;
                        setSwapTokenIn(next);
                        if (next === swapTokenOut) {
                          setSwapTokenOut(next === "EURC" ? "USDC" : "EURC");
                        }
                        setSwapEstimate(undefined);
                      }}
                      value={swapTokenIn}
                    >
                      {arcTokenSymbols.map((symbol) => (
                        <option key={symbol} value={symbol}>
                          {symbol}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-lavender-200 bg-white text-swift-700 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0"
                    onClick={flipSwapTokens}
                    type="button"
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </button>

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">To</span>
                    <select
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) => {
                        const next = event.target.value as ArcTokenSymbol;
                        setSwapTokenOut(next);
                        if (next === swapTokenIn) {
                          setSwapTokenIn(next === "EURC" ? "USDC" : "EURC");
                        }
                        setSwapEstimate(undefined);
                      }}
                      value={swapTokenOut}
                    >
                      {arcTokenSymbols.map((symbol) => (
                        <option key={symbol} value={symbol}>
                          {symbol}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-ink">Amount</span>
                  <div className="flex h-12 items-center gap-2 rounded-lg border border-lavender-200/90 bg-white/80 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] transition focus-within:border-swift-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-swift-600/15">
                    <ArrowDownUp className="h-4 w-4 text-swift-600" />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted"
                      inputMode="decimal"
                      onChange={(event) => {
                        setSwapAmount(event.target.value);
                        setSwapEstimate(undefined);
                      }}
                      placeholder="0.00"
                      value={swapAmount}
                    />
                  </div>
                </label>

                <div className="grid gap-2 rounded-lg border border-lavender-200/90 bg-white/75 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">Available</span>
                    <span className="text-right font-bold text-ink">
                      {isConnected
                        ? formatTokenAmount(
                            swapTokenBalance,
                            arcTestnetTokens[swapTokenIn].decimals,
                            swapTokenIn,
                          )
                        : "Connect wallet"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">Estimate</span>
                    <span className="text-right font-bold text-ink">
                      {swapEstimate?.estimatedOutput ?? "Not quoted"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">Minimum</span>
                    <span className="text-right font-bold text-ink">
                      {swapEstimate?.minimumOutput ?? "Not quoted"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-muted">Status</span>
                    <span className="text-right font-bold text-swift-700">
                      {swapStatus}
                    </span>
                  </div>
                </div>

                {swapError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{swapError}</span>
                  </div>
                ) : null}

                {swapExplorerUrl ? (
                  <a
                    className="inline-flex items-center gap-2 text-sm font-bold text-swift-700 transition hover:text-swift-600"
                    href={swapExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View swap on ArcScan
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-5 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-lavender-100 disabled:text-muted"
                    disabled={!canRequestSwapQuote}
                    onClick={handleEstimateSwap}
                    type="button"
                  >
                    {isSwapEstimating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ReceiptText className="h-4 w-4" />
                    )}
                    {swapQuoteButtonText}
                  </button>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
                    disabled={!canExecuteSwap}
                    onClick={handleExecuteSwap}
                    type="button"
                  >
                    {isSwapPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    {isSwapPending ? "Swapping" : swapButtonText}
                  </button>
                </div>
              </div>
            )}
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
                Short summaries from recent payments and balance state.
              </p>

              <div className="mt-5 rounded-lg border border-dashed border-lavender-200 bg-white/60 px-4 py-4">
                <p className="text-sm font-bold text-ink">
                  {!isConnected
                    ? "Connect a wallet to build a payment view."
                    : walletTransfers.length === 0
                      ? "Not enough history yet"
                      : `${walletTransfers.length} recent transfers indexed`}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {isConnected
                    ? `Selected asset: ${selectedToken}. Gas balance: ${nativeBalanceText}.`
                    : "Your activity and saved contacts will appear here after connection."}
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
                    <a
                      className="grid gap-2 rounded-lg border border-lavender-100 bg-white/90 px-3 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_10px_22px_rgba(66,17,143,0.08)] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3 sm:px-4"
                      href={`${arcTestnet.blockExplorers.default.url}/tx/${transfer.hash}`}
                      key={`${transfer.hash}-${transfer.symbol}-${transfer.direction}-${transfer.logIndex}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">
                          {transfer.direction === "out" ? "Sent" : "Received"}{" "}
                          {transfer.symbol}
                        </p>
                        <p className="truncate text-xs font-medium text-muted">
                          {transfer.direction === "out" ? "To" : "From"}{" "}
                          {getCounterpartyLabel(transfer)} -{" "}
                          {formatTransferTime(transfer.timestamp)}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-3 sm:block sm:text-right">
                        <p
                          className={`min-w-0 truncate text-sm font-bold ${
                            transfer.direction === "out"
                              ? "text-rose-600"
                              : "text-emerald-700"
                          }`}
                        >
                          {transfer.direction === "out" ? "-" : "+"}
                          {formatDisplayAmount(transfer.amount)}{" "}
                          {transfer.symbol}
                        </p>
                        <p className="shrink-0 text-xs font-bold text-swift-700">
                          ArcScan
                        </p>
                      </div>
                    </a>
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
      </div>

      {receiveOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-white/80 bg-gradient-to-br from-white via-white to-lavender-50 p-5 shadow-[0_28px_90px_rgba(18,11,32,0.28)] ring-1 ring-white/75">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="font-ui text-sm font-semibold text-swift-700">
                  Receive payment
                </p>
                <h2 className="font-heading text-2xl font-semibold tracking-normal text-ink">
                  Wallet QR
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

            <div className="mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <QRCodeSVG
                  bgColor="#ffffff"
                  fgColor="#160f24"
                  marginSize={1}
                  size={220}
                  title="SwiftPay wallet address"
                  value={`ethereum:${walletAddress}@${arcTestnet.id}`}
                />
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
              <p className="truncate font-mono text-sm font-bold text-ink">
                {walletAddress}
              </p>
              <button
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                onClick={copyAddress}
                type="button"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied" : "Copy address"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
