"use client";

import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
 AlertCircle,
 CheckCircle2,
 Copy,
 ExternalLink,
 Loader2,
 Plus,
 Send,
 Trash2,
 Upload,
 Users,
 Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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

import { CircleFaucetLink } from "@/components/circle-faucet-link";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { ProfileMenu, type WalletMode } from "@/components/profile-menu";
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
import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

type BatchRecipient = {
 address: Address;
 amount: string;
 amountUnits: bigint;
 label?: string;
 line: number;
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

const sampleRecipients = [
 "0xA71CE15C5A0F4B9d7217B8A7A2E6d9D3F55A9cE1, 1.25, Operations",
 "0x43d3ec372cb6fc158d7bc78377042d01d3a3b790, 2.00, Contractor",
].join("\n");
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

 return "SwiftBatch transaction failed.";
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

function parseRecipientRows(input: string, token: ArcTokenSymbol) {
 const decimals = arcTestnetTokens[token].decimals;
 const recipients: BatchRecipient[] = [];
 const errors: string[] = [];

 input
 .split(/\r?\n/)
 .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
 .filter(({ line }) => line.length > 0)
 .forEach(({ line, lineNumber }) => {
 const parts = line.includes(",")
 ? line.split(",").map((part) => part.trim())
 : line.split(/\s+/).map((part) => part.trim());
 const [rawAddress, rawAmount, ...labelParts] = parts;

 if (!rawAddress || !rawAmount) {
 errors.push(`Line ${lineNumber}: address and amount are required.`);
 return;
 }

 if (!isAddress(rawAddress)) {
 errors.push(`Line ${lineNumber}: invalid recipient address.`);
 return;
 }

 let amountUnits: bigint;

 try {
 amountUnits = parseUnits(rawAmount, decimals);
 } catch {
 errors.push(`Line ${lineNumber}: invalid amount.`);
 return;
 }

 if (amountUnits <= zeroAmount) {
 errors.push(`Line ${lineNumber}: amount must be greater than zero.`);
 return;
 }

 recipients.push({
 address: getAddress(rawAddress) as Address,
 amount: rawAmount,
 amountUnits,
 label: labelParts.join(", ").trim() || undefined,
 line: lineNumber,
 });
 });

 if (recipients.length > swiftBatchMaxRecipients) {
 errors.push(`SwiftBatch supports up to ${swiftBatchMaxRecipients} recipients.`);
 }

 return { errors, recipients };
}

function parseCsvLine(line: string) {
 const values: string[] = [];
 let current = "";
 let inQuotes = false;

 for (let index = 0; index < line.length; index += 1) {
 const char = line[index];

 if (char === '"') {
 if (inQuotes && line[index + 1] === '"') {
 current += '"';
 index += 1;
 } else {
 inQuotes = !inQuotes;
 }
 continue;
 }

 if (char === "," && !inQuotes) {
 values.push(current.trim());
 current = "";
 continue;
 }

 current += char;
 }

 values.push(current.trim());
 return values;
}

function csvToRecipientText(csv: string) {
 const lines = csv
 .split(/\r?\n/)
 .map((line) => line.trim())
 .filter(Boolean);
 const rows: string[] = [];

 lines.forEach((line, index) => {
 const columns = parseCsvLine(line);

 if (columns.length < 2) {
 return;
 }

 const [address, amount, ...labelParts] = columns;
 const looksLikeHeader =
 index === 0 &&
 /address|wallet|recipient/i.test(address) &&
 /amount|value|sum/i.test(amount);

 if (looksLikeHeader) {
 return;
 }

 const label = labelParts.join(", ").trim();
 rows.push(label ? `${address}, ${amount}, ${label}` : `${address}, ${amount}`);
 });

 return rows.join("\n");
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
 const circleSdkRef = useRef<W3SSdk | null>(null);
 const csvInputRef = useRef<HTMLInputElement | null>(null);
 const { address: externalAddress, isConnected } = useAccount();
 const chainId = useChainId();
 const { switchChainAsync } = useSwitchChain();
 const { writeContractAsync } = useWriteContract();
 const [walletMode, setWalletMode] = useState<WalletMode>("external");
 const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
 null,
 );
 const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
 const [circleBalances, setCircleBalances] = useState<CircleTokenBalance[]>(
 [],
 );
 const [selectedToken, setSelectedToken] = useState<ArcTokenSymbol>("USDC");
 const [recipientText, setRecipientText] = useState(sampleRecipients);
 const [status, setStatus] = useState("Ready");
 const [error, setError] = useState<string | null>(null);
 const [explorerUrl, setExplorerUrl] = useState("");
 const [isPending, setIsPending] = useState(false);
 const [csvFileName, setCsvFileName] = useState<string | null>(null);
 const selectedTokenInfo = arcTestnetTokens[selectedToken];
 const parsedBatch = useMemo(
 () => parseRecipientRows(recipientText, selectedToken),
 [recipientText, selectedToken],
 );
 const recipients = parsedBatch.recipients;
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
 const circleWallet = circleWallets.find((wallet) =>
 wallet.address && isAddress(wallet.address),
 );
 const circleAddress = circleWallet?.address
 ? (getAddress(circleWallet.address) as Address)
 : undefined;
 const walletAddress =
 walletMode === "circle" ? circleAddress : externalAddress;
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
 parsedBatch.errors.length === 0 &&
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
 "SwiftBatch is not configured. Deploy SwiftBatch and set NEXT_PUBLIC_SWIFTBATCH_ADDRESS.",
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
 setStatus(`Approve ${selectedToken} for SwiftBatch`);
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

 setStatus("Send SwiftBatch transaction");
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
 setStatus(`Approve ${selectedToken} for SwiftBatch`);
 await executeCircleContract({
 callData: encodeFunctionData({
 abi: erc20Abi,
 functionName: "approve",
 args: [batchAddress, requiredAmountUnits],
 }),
 contractAddress: tokenAddress,
 label: `Approve ${selectedToken}`,
 refId: `swiftbatch-approve-${selectedToken}-${Date.now()}`,
 });
 await waitForAllowance(circleAddress, tokenAddress, requiredAmountUnits);
 }

 setStatus("Create SwiftBatch transaction");
 const result = await executeCircleContract({
 callData: encodeFunctionData({
 abi: swiftBatchAbi,
 functionName: "sendBatch",
 args: getBatchArgs(),
 }),
 contractAddress: batchAddress,
 label: "Send SwiftBatch",
 refId: `swiftbatch-send-${Date.now()}`,
 });

 return result.txHash as Hash | undefined;
 }

 async function submitBatch() {
 setError(null);
 setExplorerUrl("");

 try {
 if (parsedBatch.errors.length > 0) {
 throw new Error(parsedBatch.errors[0]);
 }

 if (recipients.length === 0) {
 throw new Error("Add at least one recipient.");
 }

 if (recipients.length > swiftBatchMaxRecipients) {
 throw new Error(`SwiftBatch supports up to ${swiftBatchMaxRecipients} recipients.`);
 }

 if (!walletAddress) {
 throw new Error("Connect a wallet before sending.");
 }

 if (!hasEnoughBalance) {
 throw new Error(`Insufficient ${selectedToken} balance for payouts and fee.`);
 }

 setIsPending(true);
 setStatus("Preparing SwiftBatch");

 const txHash = isEmbeddedWalletMode
 ? await executeCircleBatch()
 : await executeExternalBatch();

 if (txHash) {
 setExplorerUrl(`${arcTestnet.blockExplorers.default.url}/tx/${txHash}`);
 }

 setStatus(`${recipients.length} recipient batch submitted`);
 await refreshBalances();
 } catch (submitError) {
 setError(getErrorMessage(submitError));
 setStatus("SwiftBatch failed");
 } finally {
 setIsPending(false);
 }
 }

 function addRecipientRow() {
 setRecipientText((current) =>
 `${current.trim()}\n0x0000000000000000000000000000000000000000, 1.00`.trim(),
 );
 }

 function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
 const file = event.target.files?.[0];

 if (!file) {
 return;
 }

 if (!file.name.toLowerCase().endsWith(".csv")) {
 setError("Upload a .csv file with address, amount, and optional label columns.");
 event.target.value = "";
 return;
 }

 const reader = new FileReader();

 reader.onload = () => {
 const csv = typeof reader.result === "string" ? reader.result : "";

 if (!csv.trim()) {
 setError("The CSV file is empty.");
 return;
 }

 const nextText = csvToRecipientText(csv);

 if (!nextText.trim()) {
 setError("No valid recipient rows were found in the CSV file.");
 return;
 }

 setRecipientText(nextText);
 setCsvFileName(file.name);
 setError(null);
 setStatus(`Loaded ${file.name}`);
 };

 reader.onerror = () => {
 setError("Could not read the CSV file. Try again.");
 };

 reader.readAsText(file);
 event.target.value = "";
 }

 async function copyPreview() {
 const preview = [
 `SwiftBatch ${selectedToken}`,
 `Recipients: ${recipients.length}`,
 `Payout total: ${formatTokenAmount(totalAmountUnits, selectedTokenInfo.decimals, selectedToken)}`,
 `Platform fee: ${formatTokenAmount(feeAmountUnits, selectedTokenInfo.decimals, selectedToken)}`,
 `Required approval: ${formatTokenAmount(requiredAmountUnits, selectedTokenInfo.decimals, selectedToken)}`,
 ].join("\n");

 await navigator.clipboard.writeText(preview);
 setStatus("SwiftBatch preview copied");
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
 <>
 <CircleFaucetLink />
 <ProfileMenu
 circleLogin={circleLogin}
 circleWalletAddress={circleAddress}
 externalAddress={externalAddress}
 onCircleSessionCleared={handleCircleSessionCleared}
 walletMode={walletMode}
 />
 </>
 }
 subtitle="Enterprise batch settlement"
 title="SwiftBatch"
 >
 <PlatformAccessGate>
 <section className="section-panel">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="max-w-3xl">
 <span className="soft-pill soft-pill-live">One-call payouts</span>
 <h1 className="section-title mt-4">
 Batch settlement
 </h1>
 <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
 Send one token to up to {swiftBatchMaxRecipients} recipients with a {swiftBatchFeeBasisPoints / 100}% platform fee routed in the same contract call.
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
 <span className="font-bold text-muted-foreground">Contract</span>
 <span className="font-mono text-xs font-black text-foreground">
 {configuredSwiftBatchAddress
 ? shortenAddress(configuredSwiftBatchAddress)
 : "Not set"}
 </span>
 </div>
 </div>
 </div>
 </section>

 <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
 <section className="surface-panel p-4 sm:p-5">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="eyebrow">Recipients</p>
 <h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
 Batch list
 </h2>
 </div>
 <div className="flex flex-wrap gap-2">
 <input
 accept=".csv,text/csv"
 className="hidden"
 onChange={handleCsvUpload}
 ref={csvInputRef}
 type="file"
 />
 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0"
 onClick={() => csvInputRef.current?.click()}
 type="button"
 >
 <Upload className="h-4 w-4" />
 Upload CSV
 </button>
 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={() => setRecipientText(sampleRecipients)}
 type="button"
 >
 Sample
 </button>
 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={addRecipientRow}
 type="button"
 >
 <Plus className="h-4 w-4" />
 Add row
 </button>
 <button
 className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 active:translate-y-0"
 onClick={() => {
 setRecipientText("");
 setCsvFileName(null);
 }}
 type="button"
 >
 <Trash2 className="h-4 w-4" />
 Clear
 </button>
 </div>
 </div>

 <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
 <label className="grid gap-2">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <span className="text-sm font-black text-foreground">
 Recipient rows
 </span>
 {csvFileName ? (
 <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
 {csvFileName}
 </span>
 ) : null}
 </div>
 <p className="text-xs text-muted-foreground">
 Upload a CSV with columns: address, amount, label (optional). You can still edit rows below.
 </p>
 <textarea
 className="field-shell min-h-[22rem] resize-y px-3 py-3 font-mono text-sm font-semibold text-foreground outline-none"
 onChange={(event) => setRecipientText(event.target.value)}
 placeholder="address, amount, label"
 value={recipientText}
 />
 </label>

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
 <span className="font-bold text-muted-foreground">Parsed</span>
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

 {parsedBatch.errors.length > 0 ? (
 <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-bold text-rose-700">
 <div className="flex items-start gap-2">
 <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
 <div className="min-w-0">
 {parsedBatch.errors.slice(0, 4).map((rowError) => (
 <p className="break-words" key={rowError}>
 {rowError}
 </p>
 ))}
 {parsedBatch.errors.length > 4 ? (
 <p>{parsedBatch.errors.length - 4} more issue(s)</p>
 ) : null}
 </div>
 </div>
 </div>
 ) : null}

 {recipients.length > 0 ? (
 <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
 <div className="grid grid-cols-[4rem_minmax(0,1fr)_8rem] gap-3 border-b border-border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
 <span>Line</span>
 <span>Recipient</span>
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
 <p className="truncate font-mono text-xs font-black text-foreground">
 {recipient.address}
 </p>
 {recipient.label ? (
 <p className="mt-1 truncate text-xs font-bold text-muted-foreground">
 {recipient.label}
 </p>
 ) : null}
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
 {isPending ? "Processing" : "Send SwiftBatch"}
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
 Signed-in profile — batch transactions use this wallet only.
 </p>

 <button
 className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
 onClick={() => void refreshBalances()}
 type="button"
 >
 <Upload className="h-4 w-4" />
 Refresh balances
 </button>
 </section>
 </aside>
 </div>
 </PlatformAccessGate>
 </PlatformChrome>
 );
}
