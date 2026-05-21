"use client";

import {
  AlertCircle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  ReceiptText,
  RefreshCw,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { formatUnits, isAddress, parseUnits, type Address } from "viem";

import { Providers } from "@/app/providers";
import { BrandMark } from "@/components/brand-mark";
import { PlatformNav } from "@/components/platform-nav";
import { ProfileMenu, type WalletMode } from "@/components/profile-menu";
import { SettingsButton } from "@/components/settings-button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import {
  callCircleWalletApi,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
  writeCircleWallets,
} from "@/lib/circle-session";
import { erc20Abi } from "@/lib/contracts";
import {
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";
import {
  estimateCircleSwap,
  estimateCircleUserWalletSwap,
  executeCircleSwap,
  executeCircleUserWalletSwap,
  type CircleSwapEstimate,
} from "@/swap/browser";

const fallbackAddress = "0x0000000000000000000000000000000000000000";
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.split("\n")[0] ?? error.message;
  }

  return "Swap failed. Check wallet details and try again.";
}

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

function SwapContent() {
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const {
    address: accountAddress,
    connector,
    isConnected: isAccountConnected,
  } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const [isMounted, setIsMounted] = useState(false);
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [walletMode, setWalletMode] = useState<WalletMode>("circle");
  const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
  const [isCircleLoading, setIsCircleLoading] = useState(false);
  const [swapTokenIn, setSwapTokenIn] = useState<ArcTokenSymbol>("USDC");
  const [swapTokenOut, setSwapTokenOut] = useState<ArcTokenSymbol>("EURC");
  const [swapAmount, setSwapAmount] = useState("10.00");
  const [swapEstimate, setSwapEstimate] = useState<CircleSwapEstimate>();
  const [swapExplorerUrl, setSwapExplorerUrl] = useState<string>();
  const [swapStatus, setSwapStatus] = useState("Ready");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [isSwapEstimating, setIsSwapEstimating] = useState(false);
  const [isSwapPending, setIsSwapPending] = useState(false);

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
  const address = isEmbeddedWalletMode ? circleAddress : externalAddress;
  const isConnected = Boolean(address);
  const fallbackAddressTyped = fallbackAddress as Address;
  const isArcNetwork = isEmbeddedWalletMode || chainId === arcTestnet.id;

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

  const tokenBalances = {
    EURC: typeof rawEurcBalance === "bigint" ? rawEurcBalance : undefined,
    USDC: typeof rawUsdcBalance === "bigint" ? rawUsdcBalance : undefined,
  } satisfies Record<ArcTokenSymbol, bigint | undefined>;

  const nativeBalanceText = nativeBalance
    ? `${Number(nativeBalance.formatted).toLocaleString(undefined, {
        maximumFractionDigits: 4,
      })} ${nativeBalance.symbol}`
    : isConnected
      ? "Loading gas"
      : "Connect wallet";

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

  async function ensureCircleSdk(login: CircleLoginResult | null = circleLogin) {
    if (!login) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    if (circleSdkRef.current) {
      return circleSdkRef.current;
    }

    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID?.trim() ?? "";

    if (!appId) {
      throw new Error("Circle wallet confirmation is not configured.");
    }

    const { W3SSdk: CircleW3SSdk } = await import(
      "@circle-fin/w3s-pw-web-sdk"
    );
    const sdk = new CircleW3SSdk({
      appSettings: {
        appId,
      },
      authentication: {
        encryptionKey: login.encryptionKey,
        userToken: login.userToken,
      },
    });
    circleSdkRef.current = sdk;

    return sdk;
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreCircleWallet() {
      const login = readCircleLogin();

      if (!login) {
        circleSdkRef.current = null;
        setCircleLogin(null);
        setCircleWallets([]);
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
        setIsCircleLoading(false);
      } else {
        setIsCircleLoading(true);
      }

      void ensureCircleSdk(login).catch(() => {
        if (!cancelled) {
          circleSdkRef.current = null;
        }
      });

      try {
        const payload = await callCircleWalletApi<{ wallets?: CircleWallet[] }>(
          "listWallets",
          {
            userToken: login.userToken,
          },
        );

        if (!cancelled) {
          const wallets = payload.wallets ?? [];
          setCircleWallets(wallets);
          writeCircleWallets(wallets);
        }
      } catch {
        if (!cancelled && cachedWallets.length === 0) {
          circleSdkRef.current = null;
          setCircleWallets([]);
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

  async function refreshBalances() {
    await Promise.allSettled([refetchEurcBalance(), refetchUsdcBalance()]);
  }

  async function ensureArcNetwork() {
    if (isArcNetwork) {
      return true;
    }

    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      return true;
    } catch (error) {
      setSwapError(getErrorMessage(error));
      return false;
    }
  }

  async function executeCircleChallenge(challengeId: string, label?: string) {
    if (!circleLogin) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    const sdk = await ensureCircleSdk(circleLogin);

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
      setSwapError("Embedded Circle wallet is not ready.");
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

    try {
      setIsSwapEstimating(true);
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
      setSwapError("Embedded Circle wallet is not ready.");
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
      setSwapEstimate(undefined);
      await refreshBalances();
    } catch (error) {
      setSwapError(getErrorMessage(error));
    } finally {
      setIsSwapPending(false);
    }
  }

  function flipSwapTokens() {
    setSwapTokenIn(swapTokenOut);
    setSwapTokenOut(swapTokenIn);
    setSwapEstimate(undefined);
    setSwapExplorerUrl(undefined);
  }

  function handleCircleSessionCleared() {
    circleSdkRef.current = null;
    setCircleLogin(null);
    setCircleWallets([]);
    setWalletMode("external");
    setSwapEstimate(undefined);
    setSwapExplorerUrl(undefined);
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="surface-panel sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link className="flex min-w-0 items-center gap-3 justify-self-start" href="/">
            <BrandMark className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="truncate text-sm font-semibold text-muted sm:text-base">
                Stablecoin swap desk
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 justify-self-start lg:justify-self-end">
            <Link
              className="hidden h-11 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0 sm:inline-flex"
              href="/dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <SettingsButton />
            {circleLogin ? (
              <ProfileMenu
                circleLogin={circleLogin}
                circleWalletAddress={circleAddress}
                externalAddress={externalAddress}
                onCircleSessionCleared={handleCircleSessionCleared}
                onWalletModeChange={setWalletMode}
                walletMode={walletMode}
              />
            ) : (
              <WalletConnectButton />
            )}
          </div>
        </header>

        <div className="sticky top-[5.75rem] z-10 flex justify-center">
          <PlatformNav />
        </div>

        <section className="surface-panel p-4 sm:p-5">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Swap</p>
              <h1 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                Convert balances
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Choose the stablecoin pair, get a Circle quote, and execute the
                swap from the connected wallet.
              </p>
            </div>

            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-3 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white active:translate-y-0"
              onClick={() => void refreshBalances()}
              type="button"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isEurcBalanceLoading || isUsdcBalanceLoading
                    ? "animate-spin"
                    : ""
                }`}
              />
              Refresh
            </button>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {(["USDC", "EURC"] as const).map((symbol) => (
              <div className="surface-card px-4 py-4" key={symbol}>
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                    <CircleDollarSign className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black text-muted">
                    {arcTestnetTokens[symbol].name}
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold text-muted">
                  {symbol} balance
                </p>
                <p className="mt-2 truncate text-xl font-black text-ink">
                  {isConnected
                    ? formatTokenAmount(
                        tokenBalances[symbol],
                        arcTestnetTokens[symbol].decimals,
                        symbol,
                      )
                    : "Connect wallet"}
                </p>
              </div>
            ))}

            <div className="surface-card px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-swift-700 shadow-sm">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-xs font-black text-muted">
                  {isArcNetwork ? "Arc Testnet" : "Wrong network"}
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-muted">Gas</p>
              <p className="mt-2 truncate text-xl font-black text-ink">
                {nativeBalanceText}
              </p>
            </div>
          </div>

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
                    setSwapExplorerUrl(undefined);
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
                    setSwapExplorerUrl(undefined);
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
                    setSwapExplorerUrl(undefined);
                  }}
                  placeholder="0.00"
                  value={swapAmount}
                />
              </div>
            </label>

            <div className="grid gap-2 rounded-lg border border-lavender-200/90 bg-white/75 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-muted">Wallet</span>
                <span className="text-right font-bold text-ink">
                  <span className="mr-2 text-xs text-muted">
                    {isEmbeddedWalletMode ? "Circle" : "External"}
                  </span>
                  <span className="font-mono text-xs">
                    {shortenAddress(address)}
                  </span>
                </span>
              </div>
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
                  {isCircleLoading
                    ? "Loading Circle wallet"
                    : isSwitchingChain
                      ? "Switching network"
                      : swapStatus}
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
                {isSwapPending || isSwitchingChain ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {isSwapPending ? "Swapping" : swapButtonText}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function SwapPage() {
  return (
    <Providers>
      <SwapContent />
    </Providers>
  );
}
