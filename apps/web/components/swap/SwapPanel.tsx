"use client";

import {
 AlertCircle,
 ArrowDownUp,
 ArrowLeft,
 ArrowRight,
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

import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { useT } from "@/components/locale-provider";
import { showSuccess } from "@/components/success-popup";
import { TokenSelect } from "@/components/design/token-select";
import { Button } from "@/components/ui/button";
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

import "./swap.css";

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

 const quotedRate =
  swapEstimate && Number(swapAmount) > 0 && Number(swapEstimate.estimatedOutputAmount) > 0
   ? (Number(swapEstimate.estimatedOutputAmount) / Number(swapAmount)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
     })
   : null;
 const statusText = isCircleLoading
  ? "Loading Circle wallet"
  : isSwitchingChain
   ? "Switching network"
   : swapStatus;
 const busy = isSwapEstimating || isSwapPending || isSwitchingChain;
 const primaryLabel = swapEstimate
  ? isSwapPending
   ? "Swapping"
   : `Swap ${swapAmount} ${swapTokenIn}`
  : isSwapEstimating
   ? "Getting quote"
   : swapQuoteButtonText;

 return (
  <div className="swap2-page">
   <header className="swap2-bar">
    <Link aria-label="Back to the dashboard" className="swap2-round" href="/dashboard">
     <ArrowLeft className="h-5 w-5" />
    </Link>
    <h1 className="swap2-title">Swap</h1>
    <button
     aria-label={t("common.refresh")}
     className="swap2-round"
     onClick={() => void refreshBalances()}
     title={t("common.refresh")}
     type="button"
    >
     <RefreshCw
      className={`h-5 w-5 ${isEurcBalanceLoading || isUsdcBalanceLoading ? "animate-spin" : ""}`}
     />
    </button>
   </header>

   <p className="swap2-lede">{t("swap.body")}</p>

   <section className="swap2-legs">
    <div className="swap2-leg">
     <div className="swap2-leg-top">
      <span>You pay</span>
      <span>
       Balance{" "}
       <strong>
        {isConnected
         ? formatTokenAmount(swapTokenBalance, arcTokens[swapTokenIn].decimals, swapTokenIn)
         : "—"}
       </strong>
      </span>
     </div>
     <div className="swap2-leg-main">
      <input
       aria-label="Amount to swap"
       className="swap2-amount"
       inputMode="decimal"
       onChange={(event) => {
        setSwapAmount(event.target.value);
        setSwapEstimate(undefined);
        setSwapExplorerUrl(undefined);
       }}
       placeholder="0.00"
       value={swapAmount}
      />
      <TokenSelect
       className="swap2-token"
       onChange={(next) => {
        setSwapTokenIn(next);
        if (next === swapTokenOut) {
         setSwapTokenOut(next === "EURC" ? "USDC" : "EURC");
        }
        setSwapEstimate(undefined);
        setSwapExplorerUrl(undefined);
       }}
       size="sm"
       value={swapTokenIn}
      />
     </div>
    </div>

    <button aria-label="Swap direction" className="swap2-flip" onClick={flipSwapTokens} type="button">
     <ArrowDownUp className="h-5 w-5" />
    </button>

    <div className="swap2-leg is-receive">
     <div className="swap2-leg-top">
      <span>You receive</span>
      <span>{swapEstimate ? "Quoted" : "Get a quote to see"}</span>
     </div>
     <div className="swap2-leg-main">
      <span className={swapEstimate ? "swap2-amount" : "swap2-amount is-empty"}>
       {swapEstimate
        ? Number(swapEstimate.estimatedOutputAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })
        : "0.00"}
      </span>
      <TokenSelect
       className="swap2-token"
       onChange={(next) => {
        setSwapTokenOut(next);
        if (next === swapTokenIn) {
         setSwapTokenIn(next === "EURC" ? "USDC" : "EURC");
        }
        setSwapEstimate(undefined);
        setSwapExplorerUrl(undefined);
       }}
       size="sm"
       value={swapTokenOut}
      />
     </div>
    </div>
   </section>

   <dl className="swap2-details">
    <div>
     <dt>Rate</dt>
     <dd>{quotedRate ? `1 ${swapTokenIn} ≈ ${quotedRate} ${swapTokenOut}` : "Not quoted"}</dd>
    </div>
    <div>
     <dt>Minimum received</dt>
     <dd>{swapEstimate?.minimumOutput ?? "Not quoted"}</dd>
    </div>
    <div>
     <dt>Service fee</dt>
     <dd>0.3%</dd>
    </div>
    <div>
     <dt>Paying from</dt>
     <dd>
      <Wallet className="h-3.5 w-3.5" />
      {isEmbeddedWalletMode ? "Circle wallet" : "External wallet"} ·{" "}
      <span className="font-mono">{shortenAddress(address)}</span>
     </dd>
    </div>
    <div>
     <dt>Status</dt>
     <dd className="swap2-status">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {statusText}
     </dd>
    </div>
   </dl>

   {swapError ? (
    <p className="swap2-error" role="alert">
     <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
     <span className="min-w-0 break-words">{swapError}</span>
    </p>
   ) : null}

   <Button
    className="swap2-cta"
    disabled={swapEstimate ? !canExecuteSwap : !canRequestSwapQuote}
    onClick={swapEstimate ? handleExecuteSwap : handleEstimateSwap}
    type="button"
   >
    {busy ? (
     <Loader2 className="h-4 w-4 animate-spin" />
    ) : swapEstimate ? (
     <ArrowRight className="h-4 w-4" />
    ) : (
     <ReceiptText className="h-4 w-4" />
    )}
    {primaryLabel}
   </Button>
   {swapEstimate && !isSwapPending ? (
    <button className="swap2-requote" disabled={!canRequestSwapQuote} onClick={handleEstimateSwap} type="button">
     Refresh quote
    </button>
   ) : null}

   {swapExplorerUrl ? (
    <a className="swap2-link" href={swapExplorerUrl} rel="noreferrer" target="_blank">
     View swap on ArcScan
     <ExternalLink className="h-4 w-4" />
    </a>
   ) : null}
  </div>
 );
}
