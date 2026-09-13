"use client";

import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
 AlertCircle,
 CheckCircle2,
 Copy,
 Download,
 ExternalLink,
 FileUp,
 Loader2,
 ReceiptText,
 RefreshCw,
 Send,
 Share2,
 ShieldCheck,
 Trash2,
 Users,
 Wallet,
 X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
 createPublicClient,
 encodeFunctionData,
 formatUnits,
 getAddress,
 http,
 isAddress,
 parseUnits,
 type Address,
 type Hash,
 type Hex,
} from "viem";
import {
 useAccount,
 useChainId,
 useReadContract,
 useSwitchChain,
 useWriteContract,
} from "wagmi";

import {
 BatchPeopleComposer,
 type BatchComposerResult,
 type BatchPeopleComposerHandle,
} from "@/components/batch/batch-people-composer";
import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { useT } from "@/components/locale-provider";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { ProfileMenu } from "@/components/profile-menu";
import { TokenSelect } from "@/components/design/token-select";
import { TokenIcon } from "@/components/token-icon";
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
 erc20Abi,
 swiftBatchAbi,
 swiftBatchAddress,
 swiftBatchFeeBasisPoints,
 swiftBatchFeeRecipient,
 swiftBatchMaxRecipients,
} from "@/lib/contracts";
import { drawSwiftPayBrand } from "@/lib/brand-canvas";
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { activeCircleWallet } from "@/lib/business/provision-wallet";
import { usePreferredWalletMode } from "@/lib/use-preferred-wallet-mode";
import { arcTestnet } from "@/lib/wagmi";

type BatchRecipient = {
 address: Address;
 amount: string;
 amountUnits: bigint;
 label?: string;
 line: number;
 username?: string;
};

type BatchReceipt = {
 contractAddress: string;
 explorerUrl: string | null;
 feeAmount: string;
 feeRecipient: string;
 id: string;
 mode: string;
 payoutTotal: string;
 recipientCount: number;
 recipients: Array<{
 address: Address;
 amount: string;
 label?: string;
 line: number;
 }>;
 requiredApproval: string;
 submittedAt: string;
 token: ArcTokenSymbol;
 txHash: string | null;
 walletAddress: string;
};

type CircleContractChallenge = {
 challengeId?: string;
 data?: {
 challengeId?: string;
 id?: string;
 transactionId?: string;
 txHash?: string;
 };
 id?: string;
 transactionId?: string;
 txHash?: string;
};

type CircleChallengeResult = {
 data?: {
 id?: string;
 transactionId?: string;
 txHash?: string;
 };
 id?: string;
 transactionId?: string;
 txHash?: string;
};

const zeroAmount = BigInt(0);
const feeBasisPointsDenominator = BigInt(10_000);
const feeBasisPoints = BigInt(swiftBatchFeeBasisPoints);
const allowancePollAttempts = 30;
const allowancePollDelayMs = 2_000;
const arcPublicClient = createPublicClient({
 chain: arcTestnet,
 transport: http(arcTestnet.rpcUrls.default.http[0]),
});
const configuredSwiftBatchAddress =
 swiftBatchAddress && isAddress(swiftBatchAddress)
 ? (getAddress(swiftBatchAddress) as Address)
 : undefined;

function wait(milliseconds: number) {
 return new Promise((resolve) => {
 window.setTimeout(resolve, milliseconds);
 });
}

function shortenAddress(value?: string) {
 if (!value) {
 return "Not connected";
 }

 return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getErrorMessage(error: unknown) {
 if (error instanceof Error) {
 const payload = error as Error & CircleClientErrorPayload;

 return payload.code ? `[${payload.code}] ${error.message}` : error.message;
 }

 if (typeof error === "string") {
 return error;
 }

 if (typeof error === "object" && error !== null) {
 const payload = error as CircleClientErrorPayload;
 const message = payload.message ?? payload.error;

 if (message) {
 return payload.code ? `[${payload.code}] ${message}` : message;
 }
 }

  return "BatchPay transaction failed.";
}

function formatTokenAmount(
 amount: bigint,
 decimals: number,
 symbol: ArcTokenSymbol,
) {
 return `${Number(formatUnits(amount, decimals)).toLocaleString(undefined, {
 maximumFractionDigits: 6,
 })} ${symbol}`;
}

function formatBatchReceiptTime(value: string) {
 return new Intl.DateTimeFormat(undefined, {
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 month: "short",
 year: "numeric",
 }).format(new Date(value));
}

function batchReceiptFileName(receipt: BatchReceipt) {
 return `swiftpay-batchpay-${receipt.submittedAt.slice(0, 10)}.png`;
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
 return new Promise<Blob>((resolve, reject) => {
 canvas.toBlob((blob) => {
 if (!blob) {
 reject(new Error("Receipt image could not be created."));
 return;
 }
 resolve(blob);
 }, "image/png");
 });
}

function downloadPngBlob(blob: Blob, filename: string) {
 const url = URL.createObjectURL(blob);
 const link = document.createElement("a");
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 link.remove();
 window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function buildBatchReceiptPng(receipt: BatchReceipt, withLogo = true) {
 const width = 900;
 const height = 1180;
 const canvas = document.createElement("canvas");
 canvas.width = width;
 canvas.height = height;
 const context = canvas.getContext("2d");
 if (!context) throw new Error("Could not create the receipt.");

 const fill = context.createLinearGradient(0, 0, width, height);
 fill.addColorStop(0, "#17111c");
 fill.addColorStop(1, "#21132f");
 context.fillStyle = fill;
 context.fillRect(0, 0, width, height);

 context.fillStyle = "#fff9f0";
 context.fillRect(36, 36, width - 72, height - 72);

 const header = context.createLinearGradient(36, 36, width - 36, 220);
 header.addColorStop(0, "#5b21b6");
 header.addColorStop(1, "#21132f");
 context.fillStyle = header;
 context.fillRect(36, 36, width - 72, 168);

 if (withLogo) {
 await drawSwiftPayBrand(context, 64, 52, 72, { swiftFill: "#fff9f0" });
 } else {
 context.fillStyle = "#fff9f0";
 context.font = "700 28px Sora, Arial, sans-serif";
 context.fillText("SwiftPay", 64, 96);
 }
 context.fillStyle = "#fff9f0";
 context.font = "600 18px Manrope, Arial, sans-serif";
 context.fillText("BatchPay receipt", 154, 128);
 context.font = "700 36px Sora, Arial, sans-serif";
 context.fillText(`${receipt.payoutTotal} ${receipt.token}`, 64, 172);

 context.fillStyle = "#17111c";
 context.font = "700 16px Manrope, Arial, sans-serif";
 const rows = [
 ["Recipients", String(receipt.recipientCount)],
 ["Platform fee", receipt.feeAmount],
 ["Mode", receipt.mode],
 ["Wallet", receipt.walletAddress],
 ["Transaction", receipt.txHash ?? "Pending"],
 ["Submitted", formatBatchReceiptTime(receipt.submittedAt)],
 ];
 let y = 260;
 for (const [label, value] of rows) {
 context.fillStyle = "#776e65";
 context.font = "700 13px Manrope, Arial, sans-serif";
 context.fillText(label.toUpperCase(), 64, y);
 context.fillStyle = "#17111c";
 context.font = "600 16px Manrope, Arial, sans-serif";
 const text = value.length > 42 ? `${value.slice(0, 20)}…${value.slice(-10)}` : value;
 context.fillText(text, 64, y + 24);
 y += 64;
 }

 context.fillStyle = "#5b21b6";
 context.font = "700 13px Manrope, Arial, sans-serif";
 context.fillText("Generated by SwiftPay · BatchPay", 64, height - 72);

 try {
 return await canvasToPngBlob(canvas);
 } catch {
 if (withLogo) {
 return buildBatchReceiptPng(receipt, false);
 }
 throw new Error("Receipt PNG could not be created.");
 }
}

async function downloadBatchReceiptImage(receipt: BatchReceipt) {
 const blob = await buildBatchReceiptPng(receipt);
 downloadPngBlob(blob, batchReceiptFileName(receipt));
}

function getCircleChallengeId(challenge: CircleContractChallenge) {
 return (
 challenge.challengeId ??
 challenge.data?.challengeId ??
 challenge.id ??
 challenge.data?.id
 );
}

function getCircleTransactionHash(value: CircleContractChallenge | CircleChallengeResult) {
 return value.txHash ?? value.data?.txHash;
}

export default function SwiftBatchPage() {
 const t = useT();
 const circleSdkRef = useRef<W3SSdk | null>(null);
 const composerRef = useRef<BatchPeopleComposerHandle | null>(null);
 const fileInputRef = useRef<HTMLInputElement | null>(null);
 const { address: externalAddress, isConnected } = useAccount();
 const chainId = useChainId();
 const { switchChainAsync } = useSwitchChain();
 const { writeContractAsync } = useWriteContract();
 const [walletMode, setWalletMode] = usePreferredWalletMode("external");
 const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
 null,
 );
 const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
 const [circleBalances, setCircleBalances] = useState<CircleTokenBalance[]>(
 [],
 );
 const [selectedToken, setSelectedToken] = useState<ArcTokenSymbol>("USDC");
 const [status, setStatus] = useState("Ready");
 const [composer, setComposer] = useState<BatchComposerResult>({
 errors: [],
 recipients: [],
 resolving: false,
 });
 const [error, setError] = useState<string | null>(null);
 const [explorerUrl, setExplorerUrl] = useState("");
 const [isPending, setIsPending] = useState(false);
 const [batchReceipt, setBatchReceipt] = useState<BatchReceipt | null>(null);
 const [successOpen, setSuccessOpen] = useState(false);
 const selectedTokenInfo = arcTestnetTokens[selectedToken];
 const handleComposerChange = useCallback((next: BatchComposerResult) => {
 setComposer(next);
 }, []);
 const recipients = composer.recipients as BatchRecipient[];
 const totalAmountUnits = useMemo(
 () =>
 recipients.reduce(
 (total, recipient) => total + recipient.amountUnits,
 zeroAmount,
 ),
 [recipients],
 );
 const feeAmountUnits =
 (totalAmountUnits * feeBasisPoints) / feeBasisPointsDenominator;
 const requiredAmountUnits = totalAmountUnits + feeAmountUnits;
 const workspaceContext = useOptionalWorkspace();
 const isBusinessWorkspace = workspaceContext?.workspace?.kind === "business";
 const circleWallet = activeCircleWallet(
 workspaceContext?.workspace ?? null,
 circleWallets,
 workspaceContext?.ownerWallet,
 );
 const circleAddress = circleWallet?.address
 ? (getAddress(circleWallet.address) as Address)
 : undefined;
 const walletAddress = isBusinessWorkspace
 ? circleAddress
 : walletMode === "circle"
 ? circleAddress
 : externalAddress;
 const isEmbeddedWalletMode = walletMode === "circle";
 const isArcNetwork = chainId === arcTestnet.id;
 const circleTokenBalance = findCircleTokenBalance(
 circleBalances,
 selectedToken,
 );
 const parsedCircleBalance = useMemo(() => {
 if (!circleTokenBalance?.amount) {
 return undefined;
 }

 try {
 return parseUnits(circleTokenBalance.amount, selectedTokenInfo.decimals);
 } catch {
 return undefined;
 }
 }, [circleTokenBalance?.amount, selectedTokenInfo.decimals]);
 const { data: externalTokenBalance, refetch: refetchExternalBalance } =
 useReadContract({
 address: selectedTokenInfo.address,
 abi: erc20Abi,
 functionName: "balanceOf",
 args: externalAddress ? [externalAddress] : undefined,
 chainId: arcTestnet.id,
 query: {
 enabled: Boolean(externalAddress),
 },
 });
 const activeBalance =
 isEmbeddedWalletMode
 ? parsedCircleBalance
 : typeof externalTokenBalance === "bigint"
 ? externalTokenBalance
 : undefined;
 const hasEnoughBalance =
 activeBalance !== undefined && activeBalance >= requiredAmountUnits;
 const canSubmit = Boolean(
 configuredSwiftBatchAddress &&
 walletAddress &&
 recipients.length > 0 &&
 recipients.length <= swiftBatchMaxRecipients &&
 composer.errors.length === 0 &&
 !composer.resolving &&
 requiredAmountUnits > zeroAmount &&
 hasEnoughBalance &&
 !isPending,
 );

 async function refreshCircleWallet() {
 const login = readCircleLogin();

 if (!login) {
 circleSdkRef.current = null;
 setCircleLogin(null);
 setCircleWallets([]);
 setCircleBalances([]);
 setWalletMode("external");
 return;
 }

 setCircleLogin(login);
 setWalletMode("circle");

 const cachedWallets = readCircleWallets();

 if (cachedWallets.length > 0) {
 setCircleWallets(cachedWallets);
 }

 const payload = await callCircleWalletApi<{ wallets?: CircleWallet[] }>(
 "listWallets",
 {
 userToken: login.userToken,
 },
 );
 const wallets = payload.wallets ?? [];

 setCircleWallets(wallets);
 writeCircleWallets(wallets);

 const walletId = wallets[0]?.id;

 if (walletId) {
 const balancePayload = await callCircleWalletApi<{
 tokenBalances?: CircleTokenBalance[];
 }>("getTokenBalance", {
 userToken: login.userToken,
 walletId,
 });

 setCircleBalances(balancePayload.tokenBalances ?? []);
 }
 }

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
 void refreshCircleWallet().catch(() => {
 circleSdkRef.current = null;
 });
 }, []);

 async function refreshBalances() {
 if (isEmbeddedWalletMode) {
 await refreshCircleWallet();
 return;
 }

 await refetchExternalBalance();
 }

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

 async function readAllowance(owner: Address, token: Address) {
 if (!configuredSwiftBatchAddress) {
 return zeroAmount;
 }

 return arcPublicClient.readContract({
 address: token,
 abi: erc20Abi,
 functionName: "allowance",
 args: [owner, configuredSwiftBatchAddress],
 });
 }

 async function waitForAllowance(owner: Address, token: Address, amount: bigint) {
 for (let attempt = 0; attempt < allowancePollAttempts; attempt += 1) {
 const allowance = await readAllowance(owner, token);

 if (allowance >= amount) {
 return;
 }

 setStatus("Waiting for approval confirmation");
 await wait(allowancePollDelayMs);
 }

 throw new Error("Approval was submitted, but allowance is not ready yet.");
 }

 async function executeCircleChallenge(challengeId: string, label: string) {
 if (!circleLogin) {
 throw new Error("Circle wallet confirmation is not ready.");
 }

 const sdk = await ensureCircleSdk(circleLogin);

 sdk.setAuthentication({
 encryptionKey: circleLogin.encryptionKey,
 userToken: circleLogin.userToken,
 });

 setStatus(`Confirm ${label} in Circle wallet`);

 return new Promise<CircleChallengeResult>((resolve, reject) => {
 sdk.execute(challengeId, (challengeError, result) => {
 if (challengeError) {
 reject(new Error(getErrorMessage(challengeError)));
 return;
 }

 resolve((result ?? {}) as CircleChallengeResult);
 });
 });
 }

 async function executeCircleContract({
 callData,
 contractAddress,
 label,
 refId,
 }: {
 callData: Hex;
 contractAddress: Address;
 label: string;
 refId: string;
 }) {
 if (!circleLogin || !circleWallet?.id) {
 throw new Error("Circle wallet is not ready.");
 }

 const challenge = await callCircleWalletApi<CircleContractChallenge>(
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
 const challengeId = getCircleChallengeId(challenge);

 if (!challengeId) {
 const txHash = getCircleTransactionHash(challenge);

 if (txHash) {
 return { txHash };
 }

 throw new Error("Circle did not return a contract challenge.");
 }

 const result = await executeCircleChallenge(challengeId, label);

 return {
 txHash: getCircleTransactionHash(result) ?? getCircleTransactionHash(challenge),
 };
 }

 function requireSwiftBatchAddress() {
 if (!configuredSwiftBatchAddress) {
 throw new Error(
 "BatchPay is not configured. Deploy BatchPay and set NEXT_PUBLIC_SWIFTBATCH_ADDRESS.",
 );
 }

 return configuredSwiftBatchAddress;
 }

 function getBatchArgs() {
 return [
 selectedTokenInfo.address,
 recipients.map((recipient) => recipient.address),
 recipients.map((recipient) => recipient.amountUnits),
 ] as const;
 }

 async function executeExternalBatch() {
 if (!externalAddress) {
 throw new Error("Connect an external wallet before sending.");
 }

 if (!(await ensureArcNetwork())) {
 return undefined;
 }

 const batchAddress = requireSwiftBatchAddress();
 const tokenAddress = selectedTokenInfo.address;
 const allowance = await readAllowance(externalAddress, tokenAddress);

 if (allowance < requiredAmountUnits) {
 setStatus(`Approve ${selectedToken} for BatchPay`);
 const approvalHash = await writeContractAsync({
 address: tokenAddress,
 abi: erc20Abi,
 functionName: "approve",
 args: [batchAddress, requiredAmountUnits],
 chainId: arcTestnet.id,
 });

 await arcPublicClient.waitForTransactionReceipt({
 hash: approvalHash,
 timeout: 10 * 60_000,
 });
 await waitForAllowance(externalAddress, tokenAddress, requiredAmountUnits);
 }

 setStatus("Send BatchPay transaction");
 const hash = await writeContractAsync({
 address: batchAddress,
 abi: swiftBatchAbi,
 functionName: "sendBatch",
 args: getBatchArgs(),
 chainId: arcTestnet.id,
 });

 await arcPublicClient.waitForTransactionReceipt({
 hash,
 timeout: 10 * 60_000,
 });

 return hash;
 }

 async function executeCircleBatch() {
 if (!circleLogin || !circleWallet?.id || !circleAddress) {
 throw new Error("Circle wallet is not ready.");
 }

 const batchAddress = requireSwiftBatchAddress();
 const tokenAddress = selectedTokenInfo.address;
 const allowance = await readAllowance(circleAddress, tokenAddress);

 if (allowance < requiredAmountUnits) {
 setStatus(`Approve ${selectedToken} for BatchPay`);
 await executeCircleContract({
 callData: encodeFunctionData({
 abi: erc20Abi,
 functionName: "approve",
 args: [batchAddress, requiredAmountUnits],
 }),
 contractAddress: tokenAddress,
 label: `Approve ${selectedToken}`,
 refId: `batchpay-approve-${selectedToken}-${Date.now()}`,
 });
 await waitForAllowance(circleAddress, tokenAddress, requiredAmountUnits);
 }

 setStatus("Create BatchPay transaction");
 const result = await executeCircleContract({
 callData: encodeFunctionData({
 abi: swiftBatchAbi,
 functionName: "sendBatch",
 args: getBatchArgs(),
 }),
 contractAddress: batchAddress,
 label: "Send BatchPay",
 refId: `batchpay-send-${Date.now()}`,
 });

 return result.txHash as Hash | undefined;
 }

 function createBatchReceipt(txHash?: Hash): BatchReceipt {
 const nextExplorerUrl = txHash
 ? `${arcTestnet.blockExplorers.default.url}/tx/${txHash}`
 : null;

 return {
 contractAddress: configuredSwiftBatchAddress
 ? configuredSwiftBatchAddress
 : "Not configured",
 explorerUrl: nextExplorerUrl,
 feeAmount: formatTokenAmount(
 feeAmountUnits,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 feeRecipient: swiftBatchFeeRecipient || "Not configured",
 id: txHash ?? `swiftbatch-${Date.now()}`,
 mode: isEmbeddedWalletMode ? "Circle wallet" : "External wallet",
 payoutTotal: formatTokenAmount(
 totalAmountUnits,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 recipientCount: recipients.length,
 recipients: recipients.map((recipient) => ({
 address: recipient.address,
 amount: recipient.amount,
 label: recipient.username
 ? `@${recipient.username}${recipient.label ? ` · ${recipient.label}` : ""}`
 : recipient.label,
 line: recipient.line,
 })),
 requiredApproval: formatTokenAmount(
 requiredAmountUnits,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 submittedAt: new Date().toISOString(),
 token: selectedToken,
 txHash: txHash ?? null,
 walletAddress: walletAddress ?? "Not connected",
 };
 }

 async function submitBatch() {
 setError(null);
 setExplorerUrl("");
 setSuccessOpen(false);

 try {
 if (composer.resolving) {
 throw new Error("Wait for usernames to resolve before sending.");
 }

 if (composer.errors.length > 0) {
 throw new Error(composer.errors[0]);
 }

 if (recipients.length === 0) {
 throw new Error("Add at least one recipient.");
 }

 if (recipients.length > swiftBatchMaxRecipients) {
 throw new Error(`BatchPay supports up to ${swiftBatchMaxRecipients} recipients.`);
 }

 if (!walletAddress) {
 throw new Error("Connect a wallet before sending.");
 }

 if (!hasEnoughBalance) {
 throw new Error(`Insufficient ${selectedToken} balance for payouts and fee.`);
 }

 setIsPending(true);
 setStatus("Preparing BatchPay");

 const txHash = isEmbeddedWalletMode
 ? await executeCircleBatch()
 : await executeExternalBatch();

 const receipt = createBatchReceipt(txHash);

 if (receipt.explorerUrl) {
 setExplorerUrl(receipt.explorerUrl);
 }

 setBatchReceipt(receipt);
 setSuccessOpen(true);

 setStatus(`${recipients.length} recipient batch submitted`);
 await refreshBalances();
 } catch (submitError) {
 setError(getErrorMessage(submitError));
 setStatus("BatchPay failed");
 } finally {
 setIsPending(false);
 }
 }

 async function copyPreview() {
 const preview = [
 `BatchPay ${selectedToken}`,
 `Recipients: ${recipients.length}`,
 `Payout total: ${formatTokenAmount(totalAmountUnits, selectedTokenInfo.decimals, selectedToken)}`,
 `Platform fee: ${formatTokenAmount(feeAmountUnits, selectedTokenInfo.decimals, selectedToken)}`,
 `Required approval: ${formatTokenAmount(requiredAmountUnits, selectedTokenInfo.decimals, selectedToken)}`,
 ].join("\n");

 await navigator.clipboard.writeText(preview);
 setStatus("BatchPay preview copied");
 }

 async function downloadReceiptPng(receipt: BatchReceipt | null = batchReceipt) {
 if (!receipt) return;
 try {
 await downloadBatchReceiptImage(receipt);
 setStatus("Batch receipt downloaded");
 } catch (error) {
 setStatus(
 error instanceof Error
 ? error.message
 : "Receipt PNG could not be downloaded.",
 );
 }
 }

 async function shareBatchReceipt(receipt: BatchReceipt | null = batchReceipt) {
 if (!receipt) {
 return;
 }

 try {
 const blob = await buildBatchReceiptPng(receipt);
 const file = new File([blob], batchReceiptFileName(receipt), {
 type: "image/png",
 });
 if (navigator.canShare?.({ files: [file] })) {
 await navigator.share({
 files: [file],
 title: "SwiftPay BatchPay receipt",
 });
 setStatus("Batch receipt shared");
 return;
 }
 downloadPngBlob(blob, file.name);
 setStatus("PNG downloaded. This browser cannot share image files.");
 } catch (shareError) {
 if (shareError instanceof DOMException && shareError.name === "AbortError") {
 return;
 }
 setStatus(
 shareError instanceof Error
 ? shareError.message
 : "Batch receipt could not be shared.",
 );
 }
 }

 function handleCsvUpload(event: React.ChangeEvent<HTMLInputElement>) {
 const file = event.target.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = (e) => {
 const text = e.target?.result;
 if (typeof text !== "string") return;
 const count = composerRef.current?.importText(text) ?? 0;
 setStatus(count > 0 ? `Imported ${count} recipient${count > 1 ? "s" : ""} from CSV` : "No valid rows found in CSV");
 };
 reader.readAsText(file);
 // Reset the input so re-uploading the same file triggers onChange
 event.target.value = "";
 }

 function handleCircleSessionCleared() {
 circleSdkRef.current = null;
 setCircleLogin(null);
 setCircleWallets([]);
 setCircleBalances([]);
 setWalletMode("external");
 }

 return (
 <PlatformChrome
 actions={
 <ProfileMenu
 circleLogin={circleLogin}
 circleWalletAddress={circleAddress}
 externalAddress={externalAddress}
 onCircleSessionCleared={handleCircleSessionCleared}
 walletMode={walletMode}
 />
 }
 subtitle="Enterprise batch settlement"
 title="BatchPay"
 >
 <PlatformAccessGate>
 <section className="section-panel">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="max-w-3xl">
 <span className="soft-pill soft-pill-live">{t("batch.oneCall")}</span>
 <h1 className="section-title mt-4">
 {t("batch.heading")}
 </h1>
 <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
 {t("batch.body", {
   count: swiftBatchMaxRecipients,
   fee: swiftBatchFeeBasisPoints / 100,
 })}
 </p>
 </div>

 <div className="grid min-w-[min(100%,18rem)] gap-2 rounded-lg border border-border bg-card p-3 text-sm">
 <div className="flex items-center justify-between gap-3">
 <span className="font-bold text-muted-foreground">Wallet</span>
 <span className="font-mono text-xs font-black text-foreground">
 {shortenAddress(walletAddress)}
 </span>
 </div>
 <div className="flex items-center justify-between gap-3">
 <span className="font-bold text-muted-foreground">{t("common.contract")}</span>
 <span className="font-mono text-xs font-black text-foreground">
 {configuredSwiftBatchAddress
 ? shortenAddress(configuredSwiftBatchAddress)
 : t("common.notSet")}
 </span>
 </div>
 </div>
 </div>
 </section>

 <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
 <section className="surface-panel p-4 sm:p-5">
 <input
  accept=".csv,.txt"
  className="hidden"
  onChange={handleCsvUpload}
  ref={fileInputRef}
  type="file"
 />

 <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
 <BatchPeopleComposer
  actions={
   <>
    <button
     className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
     onClick={() => fileInputRef.current?.click()}
     type="button"
    >
     <FileUp className="h-4 w-4" />
     CSV
    </button>
    <button
     className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 active:translate-y-0"
     onClick={() => composerRef.current?.clear()}
     type="button"
    >
     <Trash2 className="h-4 w-4" />
     Clear
    </button>
   </>
  }
  maxRecipients={swiftBatchMaxRecipients}
  onResolvedChange={handleComposerChange}
  ref={composerRef}
  token={selectedToken}
 />

 <div className="grid content-start gap-3">
 <TokenSelect
 label="Token"
 onChange={setSelectedToken}
 value={selectedToken}
 />

 <div className="surface-card p-3">
 <div className="flex items-center gap-2">
 <TokenIcon className="h-6 w-6" symbol={selectedToken} />
 <div className="min-w-0">
 <p className="text-sm font-black text-foreground">
 {selectedTokenInfo.name}
 </p>
 <p className="truncate text-xs font-bold text-muted-foreground">
 {shortenAddress(selectedTokenInfo.address)}
 </p>
 </div>
 </div>
 </div>

 <div className="surface-card grid gap-2 p-3 text-sm">
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-muted-foreground">Ready</span>
 <span className="font-black text-foreground">
 {recipients.length}
 </span>
 </div>
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-muted-foreground">Limit</span>
 <span className="font-black text-foreground">
 {swiftBatchMaxRecipients}
 </span>
 </div>
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-muted-foreground">Mode</span>
 <span className="font-black text-foreground">
 {isEmbeddedWalletMode ? "Circle" : "External"}
 </span>
 </div>
 </div>
 </div>
 </div>

 {composer.errors.length > 0 ? (
 <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
 <div className="flex items-start gap-2">
 <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
 <div className="min-w-0">
 {composer.errors.slice(0, 4).map((rowError) => (
 <p className="break-words" key={rowError}>
 {rowError}
 </p>
 ))}
 {composer.errors.length > 4 ? (
 <p>{composer.errors.length - 4} more issue(s)</p>
 ) : null}
 </div>
 </div>
 </div>
 ) : null}

 {recipients.length > 0 ? (
 <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
 <div className="grid grid-cols-[4rem_minmax(0,1fr)_8rem] gap-3 border-b border-border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
 <span>#</span>
 <span>Person</span>
 <span className="text-right">Amount</span>
 </div>
 <div className="max-h-72 overflow-y-auto">
 {recipients.slice(0, 500).map((recipient) => (
 <div
 className="grid grid-cols-[4rem_minmax(0,1fr)_8rem] gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0"
 key={`${recipient.line}-${recipient.address}-${recipient.amount}`}
 >
 <span className="font-bold text-muted-foreground">
 {recipient.line}
 </span>
 <div className="min-w-0">
 <p className="truncate text-sm font-black text-foreground">
 {recipient.username ? `@${recipient.username}` : recipient.address}
 </p>
 <p className="mt-1 truncate font-mono text-[11px] font-bold text-muted-foreground">
 {recipient.username ? recipient.address : recipient.label}
 </p>
 </div>
 <span className="text-right font-black text-foreground">
 {recipient.amount}
 </span>
 </div>
 ))}
 </div>
 </div>
 ) : null}
 </section>

 <aside className="grid content-start gap-4">
 <section className="surface-panel p-4 sm:p-5">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="eyebrow">Preview</p>
 <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
 Transaction
 </h2>
 </div>
 <button
 className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={() => void copyPreview()}
 title="Copy preview"
 type="button"
 >
 <Copy className="h-4 w-4" />
 </button>
 </div>

 <div className="mt-4 grid gap-3">
 {[
 ["Recipients", recipients.length.toLocaleString()],
 [
 "Payout total",
 formatTokenAmount(
 totalAmountUnits,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 ],
 [
 "Platform fee",
 formatTokenAmount(
 feeAmountUnits,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 ],
 [
 "Approval required",
 formatTokenAmount(
 requiredAmountUnits,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 ],
 [
 "Available",
 activeBalance === undefined
 ? "Loading"
 : formatTokenAmount(
 activeBalance,
 selectedTokenInfo.decimals,
 selectedToken,
 ),
 ],
 ].map(([label, value]) => (
 <div
 className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm"
 key={label}
 >
 <span className="font-bold text-muted-foreground">{label}</span>
 <span className="max-w-[12rem] break-words text-right font-black text-foreground">
 {value}
 </span>
 </div>
 ))}
 </div>

 {!configuredSwiftBatchAddress ? (
 <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800">
 Set `NEXT_PUBLIC_SWIFTBATCH_ADDRESS` after deploying the contract.
 </div>
 ) : null}

 {!hasEnoughBalance && requiredAmountUnits > zeroAmount ? (
 <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
 Balance must cover payouts plus the platform fee.
 </div>
 ) : null}

 <button
 className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55"
 disabled={!canSubmit}
 onClick={() => void submitBatch()}
 type="button"
 >
 {isPending ? (
 <Loader2 className="h-4 w-4 animate-spin" />
 ) : (
 <Send className="h-4 w-4" />
 )}
 {isPending ? "Processing" : composer.resolving ? "Resolving people" : "Send BatchPay"}
 </button>

 <div className="mt-4 rounded-lg border border-border bg-card px-3 py-3">
 <div className="flex items-start gap-2 text-sm font-bold text-foreground">
 {error ? (
 <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
 ) : isPending ? (
 <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-swift-600" />
 ) : (
 <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
 )}
 <span className="min-w-0 break-words">
 {error ?? status}
 </span>
 </div>
 </div>

 {explorerUrl ? (
 <a
 className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 href={explorerUrl}
 rel="noreferrer"
 target="_blank"
 >
 <ExternalLink className="h-4 w-4" />
 View on ArcScan
 </a>
 ) : null}
 </section>

 <section className="surface-panel p-4 sm:p-5">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="eyebrow">Receipt</p>
 <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
 Batch receipt
 </h2>
 </div>
 <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
 <ReceiptText className="h-5 w-5" />
 </div>
 </div>

 {batchReceipt ? (
 <>
 <div className="mt-4 overflow-hidden rounded-xl border border-primary/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.10),rgba(99,102,241,0.08)_45%,transparent)] p-4">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
 Submitted
 </p>
 <p className="mt-2 font-heading text-2xl font-semibold tracking-normal text-foreground">
 {batchReceipt.payoutTotal}
 </p>
 <p className="mt-1 text-sm font-semibold text-muted-foreground">
 {batchReceipt.recipientCount.toLocaleString()} recipients /{" "}
 {batchReceipt.mode}
 </p>
 </div>
 <TokenIcon className="h-9 w-9 rounded-full shadow-sm" symbol={batchReceipt.token} />
 </div>

 <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
 <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
 <p className="text-xs font-bold text-muted-foreground">Fee</p>
 <p className="mt-1 font-black text-foreground">
 {batchReceipt.feeAmount}
 </p>
 </div>
 <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
 <p className="text-xs font-bold text-muted-foreground">Submitted</p>
 <p className="mt-1 font-black text-foreground">
 {formatBatchReceiptTime(batchReceipt.submittedAt)}
 </p>
 </div>
 </div>

 <div className="mt-4 grid gap-2 border-t border-border pt-3 text-xs font-semibold text-muted-foreground">
 <div className="flex items-center gap-2">
 <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
 <span>Contract: {shortenAddress(batchReceipt.contractAddress)}</span>
 </div>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
 <span>
 Hash:{" "}
 {batchReceipt.txHash
 ? shortenAddress(batchReceipt.txHash)
 : "Pending from wallet provider"}
 </span>
 </div>
 </div>
 </div>

 <div className="mt-3 grid gap-2">
 {batchReceipt.recipients.slice(0, 4).map((recipient) => (
 <div
 className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
 key={`${batchReceipt.id}-${recipient.line}-${recipient.address}`}
 >
 <div className="min-w-0">
 <p className="truncate font-semibold text-foreground">
 {recipient.label || `Line ${recipient.line}`}
 </p>
 <p className="truncate font-mono text-xs text-muted-foreground">
 {recipient.address}
 </p>
 </div>
 <span className="shrink-0 font-black text-foreground">
 {recipient.amount} {batchReceipt.token}
 </span>
 </div>
 ))}
 {batchReceipt.recipients.length > 4 ? (
 <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-center text-xs font-bold text-muted-foreground">
 +{batchReceipt.recipients.length - 4} more recipients on this receipt
 </div>
 ) : null}
 </div>

 <div className="mt-4 grid gap-2 sm:grid-cols-2">
 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={() => void shareBatchReceipt(batchReceipt)}
 type="button"
 >
 <Share2 className="h-4 w-4" />
 Share
 </button>
 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={() => void downloadReceiptPng(batchReceipt)}
 type="button"
 >
 <Download className="h-4 w-4" />
 Download PNG
 </button>
 {batchReceipt.explorerUrl ? (
 <a
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0 sm:col-span-2"
 href={batchReceipt.explorerUrl}
 rel="noreferrer"
 target="_blank"
 >
 <ExternalLink className="h-4 w-4" />
 Open ArcScan receipt
 </a>
 ) : null}
 </div>
 </>
 ) : (
 <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-5 text-sm font-semibold leading-6 text-muted-foreground">
 Successful BatchPay sends will generate a receipt here with totals,
 fee, recipient highlights, and ArcScan context.
 </div>
 )}
 </section>

 <section className="surface-panel p-4 sm:p-5">
 <div className="flex items-center gap-3">
 <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-card text-swift-700 shadow-sm">
 {isEmbeddedWalletMode ? (
 <Wallet className="h-5 w-5" />
 ) : (
 <Users className="h-5 w-5" />
 )}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-black text-foreground">
 {isEmbeddedWalletMode
 ? "Circle wallet"
 : "External wallet"}
 </p>
 <p className="truncate text-xs font-bold text-muted-foreground">
 {shortenAddress(walletAddress)}
 </p>
 </div>
 </div>

 <p className="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
 Signed-in profile. Batch transactions use this wallet only.
 </p>

 <button
 className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={() => void refreshBalances()}
 type="button"
 >
 <RefreshCw className="h-4 w-4" />
 Refresh balances
 </button>
 </section>
 </aside>
 </div>

 {successOpen && batchReceipt ? (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm dark:bg-background/70">
 <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl">
 <div className="mb-5 flex items-start justify-between gap-3">
 <div className="flex min-w-0 items-start gap-3">
 <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
 <CheckCircle2 className="h-6 w-6" />
 </div>
 <div className="min-w-0">
 <p className="eyebrow">BatchPay complete</p>
 <h2 className="mt-2 font-heading text-2xl font-semibold tracking-normal text-foreground">
 Transaction successful
 </h2>
 <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
 {batchReceipt.recipientCount.toLocaleString()} payouts were submitted on
 Arc Testnet.
 </p>
 </div>
 </div>
 <button
 className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-primary/30 hover:bg-primary hover:text-primary-foreground"
 onClick={() => setSuccessOpen(false)}
 type="button"
 >
 <X className="h-4 w-4" />
 </button>
 </div>

 <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
 Batch total
 </p>
 <p className="mt-2 font-heading text-3xl font-semibold tracking-normal text-foreground">
 {batchReceipt.payoutTotal}
 </p>
 <p className="mt-1 text-sm font-semibold text-muted-foreground">
 Fee {batchReceipt.feeAmount} / {batchReceipt.mode}
 </p>
 </div>
 <TokenIcon className="h-10 w-10 rounded-full shadow-sm" symbol={batchReceipt.token} />
 </div>

 <div className="mt-4 grid gap-2 rounded-lg border border-border bg-card/80 px-3 py-3 text-sm">
 <div className="flex items-start justify-between gap-3">
 <span className="font-bold text-muted-foreground">Wallet</span>
 <span className="min-w-0 break-words text-right font-mono text-xs font-black text-foreground">
 {shortenAddress(batchReceipt.walletAddress)}
 </span>
 </div>
 <div className="flex items-start justify-between gap-3">
 <span className="font-bold text-muted-foreground">Transaction</span>
 <span className="min-w-0 break-words text-right font-mono text-xs font-black text-foreground">
 {batchReceipt.txHash
 ? shortenAddress(batchReceipt.txHash)
 : "Pending from wallet provider"}
 </span>
 </div>
 <div className="flex items-start justify-between gap-3">
 <span className="font-bold text-muted-foreground">Submitted</span>
 <span className="text-right font-black text-foreground">
 {formatBatchReceiptTime(batchReceipt.submittedAt)}
 </span>
 </div>
 </div>
 </div>

 <div className="mt-5 grid gap-2 sm:grid-cols-3">
 <button
 className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary active:translate-y-0"
 onClick={() => void shareBatchReceipt(batchReceipt)}
 type="button"
 >
 <Share2 className="h-4 w-4" />
 Share
 </button>
 <button
 className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0"
 onClick={() => void downloadReceiptPng(batchReceipt)}
 type="button"
 >
 <Download className="h-4 w-4" />
 Download PNG
 </button>
 {batchReceipt.explorerUrl ? (
 <a
 className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary active:translate-y-0"
 href={batchReceipt.explorerUrl}
 rel="noreferrer"
 target="_blank"
 >
 ArcScan
 <ExternalLink className="h-4 w-4" />
 </a>
 ) : (
 <button
 className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-sm font-semibold text-muted-foreground"
 disabled
 type="button"
 >
 ArcScan pending
 </button>
 )}
 </div>
 </div>
 </div>
 ) : null}
 </PlatformAccessGate>
 </PlatformChrome>
 );
}
