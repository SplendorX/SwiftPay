"use client";

import {
 AlertCircle,
 ArrowDownUp,
 ArrowRight,
 ExternalLink,
 Loader2,
 ReceiptText,
 RefreshCw,
 Wallet,
} from "lucide-react";
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

import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { useT } from "@/components/locale-provider";
import { showSuccess } from "@/components/success-popup";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
import { recordPlatformTransactionActivity } from "@/lib/referral/activity-client";
import {
  currentCircleAuth,
 callCircleWalletApi,
 circleSessionEventName,
 readCircleLogin,
 readCircleWallets,
 type CircleLoginResult,
 type CircleWallet,
 writeCircleWallets,
} from "@/lib/circle-session";
import { erc20Abi } from "@/lib/contracts";
import { arcTokens, arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";
import { getSwapErrorMessage } from "@/lib/swap-errors";
import { activeCircleWallet } from "@/lib/business/provision-wallet";
import { usePreferredWalletMode } from "@/lib/use-preferred-wallet-mode";
import { arcChain } from "@/lib/chains";
import { readSwapReceived } from "@/lib/swap-received";
import type { CircleSwapEstimate } from "@/lib/circle-swap";

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
 return getSwapErrorMessage(error.message.split("\n")[0] ?? error.message);
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

export function SwapPanel() {
 const t = useT();
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
 const [walletMode, setWalletMode] = usePreferredWalletMode("circle");
 const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
 const [isCircleLoading, setIsCircleLoading] = useState(false);
 const [swapTokenIn, setSwapTokenIn] = useState<ArcTokenSymbol>("USDC");
 const [swapTokenOut, setSwapTokenOut] = useState<ArcTokenSymbol>("EURC");
 const [swapAmount, setSwapAmount] = useState("");
 const [swapEstimate, setSwapEstimate] = useState<CircleSwapEstimate>();
 const [swapExplorerUrl, setSwapExplorerUrl] = useState<string>();
 const [swapStatus, setSwapStatus] = useState("Ready");
 const [swapError, setSwapError] = useState<string | null>(null);
 const [isSwapEstimating, setIsSwapEstimating] = useState(false);
 const [isSwapPending, setIsSwapPending] = useState(false);

 // Links such as ALLIE's "Review the quote" carry the swap in the URL:
 // /swap?amount=1&from=USDC&to=EURC.
 useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 const pick = (value: string | null) => {
 const symbol = value?.trim().toUpperCase();
 return symbol && arcTokenSymbols.includes(symbol as ArcTokenSymbol)
 ? (symbol as ArcTokenSymbol)
 : null;
 };
 const tokenIn = pick(params.get("from"));
 const tokenOut = pick(params.get("to"));
 const amount = params.get("amount")?.trim();

 if (tokenIn && tokenOut && tokenIn !== tokenOut) {
 setSwapTokenIn(tokenIn);
 setSwapTokenOut(tokenOut);
 }
 if (amount && /^\d+(\.\d+)?$/.test(amount)) {
 setSwapAmount(amount);
 }
 }, []);

 const workspaceContext = useOptionalWorkspace();
 const isBusinessWorkspace = workspaceContext?.workspace?.kind === "business";
 const externalAddress =
 isMounted && isAccountConnected ? accountAddress : undefined;
 const circleWallet = activeCircleWallet(
 workspaceContext?.workspace ?? null,
 circleWallets,
 workspaceContext?.ownerWallet,
 );
 const circleAddress =
 circleWallet?.address && isAddress(circleWallet.address)
 ? (circleWallet.address as Address)
 : undefined;
 const isCircleWalletConnected = Boolean(circleLogin && circleAddress);
 const isEmbeddedWalletMode =
 walletMode === "circle" && isCircleWalletConnected;
  const isExternalWalletMode =
    walletMode === "external" || (!isEmbeddedWalletMode && Boolean(externalAddress));
  const address = isBusinessWorkspace
    ? (circleAddress ?? externalAddress)
    : isEmbeddedWalletMode
      ? circleAddress
      : isExternalWalletMode
        ? externalAddress
        : undefined;
 const isConnected = Boolean(address);
 const fallbackAddressTyped = fallbackAddress as Address;
 const isArcNetwork =
 isEmbeddedWalletMode || (isExternalWalletMode && chainId === arcChain.id);

 const {
 data: rawEurcBalance,
 isLoading: isEurcBalanceLoading,
 refetch: refetchEurcBalance,
 } = useReadContract({
 address: arcTokens.EURC.address,
 abi: erc20Abi,
 functionName: "balanceOf",
 args: [address ?? fallbackAddressTyped],
 chainId: arcChain.id,
 query: {
 enabled: Boolean(isConnected && address),
 },
 });

 const {
 data: rawUsdcBalance,
 isLoading: isUsdcBalanceLoading,
 refetch: refetchUsdcBalance,
 } = useReadContract({
 address: arcTokens.USDC.address,
 abi: erc20Abi,
 functionName: "balanceOf",
 args: [address ?? fallbackAddressTyped],
 chainId: arcChain.id,
 query: {
 enabled: Boolean(isConnected && address),
 },
 });

 const { data: nativeBalance } = useBalance({
 address,
 chainId: arcChain.id,
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
 return parseUnits(swapAmount, arcTokens[swapTokenIn].decimals);
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

 function onSessionChange() {
 void restoreCircleWallet();
 }

 void restoreCircleWallet();
 window.addEventListener(circleSessionEventName, onSessionChange);

 return () => {
 cancelled = true;
 window.removeEventListener(circleSessionEventName, onSessionChange);
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
 await switchChainAsync({ chainId: arcChain.id });
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

 sdk.setAuthentication(currentCircleAuth(circleLogin));

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
 await import("@/lib/circle-swap");
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
 await import("@/lib/circle-swap");
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
 `${arcChain.blockExplorers.default.url}/tx/${result.txHash}`,
 );
 const actorWallet =
 activeEmbeddedSwapWallet?.walletAddress ?? externalAddress ?? circleAddress;
 // Circle's result does not always carry the output amount; read what
 // actually arrived from the transaction, falling back to the quote.
 setSwapStatus("Confirming received amount");
 const receivedAmount =
 result.amountOut ??
 (actorWallet
 ? await readSwapReceived({
 token: swapTokenOut,
 txHash: result.txHash,
 wallet: actorWallet,
 })
 : null);
 const receivedLabel = receivedAmount
 ? `${receivedAmount} ${swapTokenOut}`
 : `≈ ${swapEstimate.estimatedOutput}`;
 setSwapStatus(`Received ${receivedLabel}`);
 const explorerUrl =
 result.explorerUrl ??
 `${arcChain.blockExplorers.default.url}/tx/${result.txHash}`;
 showSuccess({
 amount: receivedLabel,
 explorerUrl,
 eyebrow: "Swap",
 rows: [
 { label: "You paid", value: `${swapAmount} ${swapTokenIn}` },
 {
 label: receivedAmount ? "You received" : "You receive (quoted)",
 value: receivedLabel,
 },
 ],
 subtitle: `Swapped ${swapAmount} ${swapTokenIn} for ${receivedLabel}.`,
 title: "Swap successful",
 });
 if (actorWallet && swapAmount) {
 void recordPlatformTransactionActivity({
 walletAddress: actorWallet,
 amount: swapAmount,
 token: swapTokenIn,
 txHash: result.txHash,
 activityType: "SWAP",
 showToast: true,
 activity: {
 amountIn: receivedAmount ?? null,
 direction: "internal",
 source: "swap",
 title: `Swapped ${swapTokenIn} to ${swapTokenOut}`,
 tokenIn: swapTokenOut,
 },
 });
 }
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

 return (
  <div className="swap-layout">
   <section className="section-panel swap-form-board">
 <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
 <div>
 <p className="section-eyebrow">{t("swap.eyebrow")}</p>
 <h1 className="section-title">
 {t("swap.heading")}
 </h1>
 <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
 {t("swap.body")}
 </p>
 </div>

 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-accent active:translate-y-0"
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
 {t("common.refresh")}
 </button>
 </div>

 <div className="grid gap-4">
 <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
 <TokenSelect
 label="From"
 onChange={(next) => {
 setSwapTokenIn(next);
 if (next === swapTokenOut) {
 setSwapTokenOut(next === "EURC" ? "USDC" : "EURC");
 }
 setSwapEstimate(undefined);
 setSwapExplorerUrl(undefined);
 }}
 value={swapTokenIn}
 />

 <button
 className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card text-swift-700 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-swift-700 hover:text-white active:translate-y-0"
 onClick={flipSwapTokens}
 type="button"
 >
 <ArrowDownUp className="h-4 w-4" />
 </button>

 <TokenSelect
 label="To"
 onChange={(next) => {
 setSwapTokenOut(next);
 if (next === swapTokenIn) {
 setSwapTokenIn(next === "EURC" ? "USDC" : "EURC");
 }
 setSwapEstimate(undefined);
 setSwapExplorerUrl(undefined);
 }}
 value={swapTokenOut}
 />
 </div>

 <label className="grid gap-2">
 <span className="text-sm font-semibold text-foreground">Amount</span>
 <div className="flex h-12 items-center gap-2 rounded-lg border border-border bg-card px-3 transition focus-within:border-swift-600 focus-within:bg-card focus-within:ring-2 focus-within:ring-swift-600/15">
 <ArrowDownUp className="h-4 w-4 text-swift-600" />
 <input
 className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
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

 <div className="grid gap-2 rounded-lg border border-border bg-card/75 p-4 text-sm ">
 <div className="flex items-center justify-between gap-3">
 <span className="font-semibold text-muted-foreground">Wallet</span>
 <span className="text-right font-bold text-foreground">
 <span className="mr-2 text-xs text-muted-foreground">
 {isEmbeddedWalletMode ? "Circle" : "External"}
 </span>
 <span className="font-mono text-xs">
 {shortenAddress(address)}
 </span>
 </span>
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="font-semibold text-muted-foreground">Available</span>
 <span className="text-right font-bold text-foreground">
 {isConnected
 ? formatTokenAmount(
 swapTokenBalance,
 arcTokens[swapTokenIn].decimals,
 swapTokenIn,
 )
 : "Connect wallet"}
 </span>
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="font-semibold text-muted-foreground">Estimate</span>
 <span className="text-right font-bold text-foreground">
 {swapEstimate?.estimatedOutput ?? "Not quoted"}
 </span>
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="font-semibold text-muted-foreground">Minimum</span>
 <span className="text-right font-bold text-foreground">
 {swapEstimate?.minimumOutput ?? "Not quoted"}
 </span>
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="font-semibold text-muted-foreground">Service fee</span>
 <span className="text-right font-bold text-foreground">0.3%</span>
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="font-semibold text-muted-foreground">Status</span>
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
 className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
 className="sp-bubble inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
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
 );
}
