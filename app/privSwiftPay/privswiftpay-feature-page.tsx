"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileLock2,
  Folder,
  FolderPlus,
  KeyRound,
  Loader2,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  getAddress,
  http,
  isAddress,
  isHex,
  keccak256,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { BrandMark } from "@/components/brand-mark";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformNavDrawer } from "@/components/platform-nav-drawer";
import { PlatformPageBody } from "@/components/platform-page-body";
import { CircleFaucetLink } from "@/components/circle-faucet-link";
import { ProfileMenu, type WalletMode } from "@/components/profile-menu";
import { TokenIcon } from "@/components/token-icon";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import {
  callCircleWalletApi,
  type CircleClientErrorPayload,
  readCircleLogin,
  readCircleWallets,
  type CircleLoginResult,
  type CircleWallet,
  writeCircleWallets,
} from "@/lib/circle-session";
import {
  erc20Abi,
  privacyEscrowAbi,
  privacyEscrowAddress,
} from "@/lib/contracts";
import {
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

const paymentStorageKey = "swiftpay.privacy.payments";
const payrollStorageKey = "swiftpay.privacy.payroll-folders";
const codePrefix = "privswiftpay:";
const escrowAddress =
  privacyEscrowAddress && isAddress(privacyEscrowAddress)
    ? (privacyEscrowAddress as Address)
    : undefined;
const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0]),
});
const arcTransactionReceiptTimeoutMs = 10 * 60 * 1_000;
const arcTransactionReceiptPollMs = 2_000;
const circleTransactionHashAttempts = 60;
const circleTransactionHashDelayMs = 1_000;
const claimedPaymentRefreshMs = 15_000;
const escrowCompatibilityCheckId =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const erc20AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type CircleContractChallenge = {
  challengeId?: string;
  data?: {
    challengeId?: string;
    id?: string;
    transaction?: unknown;
    transactionId?: string;
    txHash?: string;
  };
  id?: string;
  transaction?: unknown;
  transactionHash?: string;
  transactionId?: string;
  txHash?: string;
};

type CircleChallengeResult = {
  data?: {
    id?: string;
    transaction?: unknown;
    transactionHash?: string;
    transactionId?: string;
    txHash?: string;
  };
  hash?: string;
  id?: string;
  status?: string;
  transaction?: unknown;
  transactionHash?: string;
  transactionId?: string;
  txHash?: string;
};

type CircleWalletTransaction = Record<string, unknown>;

type CircleRecoveredTransactionHash = {
  transactionId?: string;
  txHash: Hash;
};

type PrivacyCodePayload = {
  amount: string;
  chainId: number;
  commitment: string;
  createdAt: string;
  id: string;
  kind: "privswiftpay.payment";
  network: string;
  note?: string;
  pool: "swiftpay-privacy-pool";
  recipient: string;
  secret: string;
  sender: string;
  token: ArcTokenSymbol;
  version: 1;
};

type StoredPrivacyPayment = {
  code: string;
  createdAt: string;
  id: string;
  payload: PrivacyCodePayload;
  status: "ready" | "claimed";
};

export type PrivSwiftPayFeature = "private-send" | "payroll" | "claim";

const featureNavItems = [
  {
    feature: "private-send",
    href: "/privSwiftPay/private-send",
    icon: LockKeyhole,
    label: "Private send",
  },
  {
    feature: "payroll",
    href: "/privSwiftPay/payroll",
    icon: MailCheck,
    label: "Payroll",
  },
  {
    feature: "claim",
    href: "/privSwiftPay/claim",
    icon: KeyRound,
    label: "Claim",
  },
] satisfies {
  feature: PrivSwiftPayFeature;
  href: string;
  icon: typeof LockKeyhole;
  label: string;
}[];

type PayrollRecipient = {
  address: string;
  amount: string;
  id: string;
  name: string;
  token: ArcTokenSymbol;
};

type PayrollFolder = {
  createdAt: string;
  id: string;
  name: string;
  recipients: PayrollRecipient[];
};

type PayrollCodeRecord = {
  code: string;
  employeeName: string;
  id: string;
  payload: PrivacyCodePayload;
};

function shortenAddress(value?: string) {
  if (!value) {
    return "Not connected";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeAmount(value: string) {
  return value.trim().replace(/,/g, "");
}

function isPositiveAmount(value: string) {
  const normalized = normalizeAmount(value);

  return /^\d+(\.\d{1,6})?$/.test(normalized) && Number(normalized) > 0;
}

function formatCodeTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `privacy-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return bytesToHex(bytes);
}

function randomBytes32() {
  return `0x${randomHex(32)}` as Hex;
}

function isBytes32Hex(value: unknown): value is Hex {
  return typeof value === "string" && value.length === 66 && isHex(value);
}

function isEvmTransactionHash(value: unknown): value is Hash {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getObject(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function findTransactionHash(value: unknown): Hash | undefined {
  if (isEvmTransactionHash(value)) {
    return value;
  }

  const object = getObject(value);

  if (!object) {
    return undefined;
  }

  for (const key of ["txHash", "transactionHash", "hash"]) {
    const candidate = object[key];

    if (isEvmTransactionHash(candidate)) {
      return candidate;
    }
  }

  for (const candidate of Object.values(object)) {
    const txHash = findTransactionHash(candidate);

    if (txHash) {
      return txHash;
    }
  }

  return undefined;
}

function getCircleChallengeId(value: unknown) {
  const object = getObject(value);

  if (!object) {
    return undefined;
  }

  const data = getObject(object.data);
  const challenge = getObject(object.challenge);
  const dataChallenge = getObject(data?.challenge);

  for (const candidate of [
    object.challengeId,
    data?.challengeId,
    challenge?.id,
    dataChallenge?.id,
    object.id,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function getCircleTransactionId(value: unknown) {
  const object = getObject(value);

  if (!object) {
    return undefined;
  }

  const transaction = getObject(object.transaction);
  const data = getObject(object.data);
  const dataTransaction = getObject(data?.transaction);

  for (const candidate of [
    object.transactionId,
    transaction?.id,
    dataTransaction?.id,
    data?.transactionId,
    object.id,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function getCircleTransactionState(value: unknown) {
  const object = getObject(value);
  const transaction = getObject(object?.transaction);
  const data = getObject(object?.data);
  const dataTransaction = getObject(data?.transaction);
  const state = object?.state ?? transaction?.state ?? dataTransaction?.state;

  return typeof state === "string" ? state : undefined;
}

function getCircleTransactionError(value: unknown) {
  const object = getObject(value);
  const transaction = getObject(object?.transaction);
  const data = getObject(object?.data);
  const dataTransaction = getObject(data?.transaction);
  const reason =
    object?.errorDetails ??
    object?.errorReason ??
    transaction?.errorDetails ??
    transaction?.errorReason ??
    dataTransaction?.errorDetails ??
    dataTransaction?.errorReason;

  return typeof reason === "string" && reason.trim() ? reason : undefined;
}

function getCircleTransactionString(value: unknown, key: string) {
  const object = getObject(value);
  const transaction = getObject(object?.transaction);
  const data = getObject(object?.data);
  const dataTransaction = getObject(data?.transaction);

  for (const candidate of [
    object?.[key],
    transaction?.[key],
    dataTransaction?.[key],
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function getCircleTransactions(value: unknown): CircleWalletTransaction[] {
  const object = getObject(value);
  const data = getObject(object?.data);

  for (const candidate of [object?.transactions, data?.transactions]) {
    if (Array.isArray(candidate)) {
      return candidate
        .filter((transaction) => getObject(transaction))
        .map((transaction) => transaction as CircleWalletTransaction);
    }
  }

  const transaction = getObject(object?.transaction);

  return transaction ? [transaction as CircleWalletTransaction] : [];
}

function getCircleCorrelationIds(value: unknown) {
  const object = getObject(value);
  const challenge = getObject(object?.challenge);
  const data = getObject(object?.data);
  const dataChallenge = getObject(data?.challenge);

  for (const candidate of [
    object?.correlationIds,
    challenge?.correlationIds,
    dataChallenge?.correlationIds,
  ]) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (correlationId): correlationId is string =>
          typeof correlationId === "string" &&
          correlationId.trim().length > 0,
      );
    }
  }

  return [];
}

function getCircleChallengeStatus(value: unknown) {
  const object = getObject(value);
  const challenge = getObject(object?.challenge);
  const data = getObject(object?.data);
  const dataChallenge = getObject(data?.challenge);
  const status = object?.status ?? challenge?.status ?? dataChallenge?.status;

  return typeof status === "string" ? status : undefined;
}

function getCircleChallengeError(value: unknown) {
  const object = getObject(value);
  const challenge = getObject(object?.challenge);
  const data = getObject(object?.data);
  const dataChallenge = getObject(data?.challenge);
  const reason =
    object?.errorMessage ??
    object?.errorCode ??
    challenge?.errorMessage ??
    challenge?.errorCode ??
    dataChallenge?.errorMessage ??
    dataChallenge?.errorCode;

  return typeof reason === "string" && reason.trim()
    ? reason
    : typeof reason === "number"
      ? String(reason)
      : undefined;
}

function assertCircleTransactionDidNotFail(value: unknown) {
  const state = getCircleTransactionState(value)?.toUpperCase();

  if (state && ["CANCELLED", "DENIED", "FAILED", "STUCK"].includes(state)) {
    throw new Error(
      getCircleTransactionError(value) ??
        `Circle transaction ${state.toLowerCase()}.`,
    );
  }
}

function isCircleTransactionComplete(value: unknown) {
  const state = getCircleTransactionState(value)?.toUpperCase();

  return state === "COMPLETE" || state === "CONFIRMED";
}

function assertCircleChallengeDidNotFail(value: unknown) {
  const status = getCircleChallengeStatus(value)?.toUpperCase();

  if (status && ["CANCELLED", "DENIED", "EXPIRED", "FAILED"].includes(status)) {
    throw new Error(
      getCircleChallengeError(value) ??
        `Circle challenge ${status.toLowerCase()}.`,
    );
  }
}

function isMatchingCircleTransaction(
  transaction: CircleWalletTransaction,
  refId: string,
  contractAddress: Address,
  walletId: string,
) {
  if (getCircleTransactionString(transaction, "refId") !== refId) {
    return false;
  }

  const transactionWalletId = getCircleTransactionString(transaction, "walletId");

  if (transactionWalletId && transactionWalletId !== walletId) {
    return false;
  }

  const transactionContractAddress = getCircleTransactionString(
    transaction,
    "contractAddress",
  );

  return (
    !transactionContractAddress ||
    transactionContractAddress.toLowerCase() === contractAddress.toLowerCase()
  );
}

function buildCommitment(paymentId: Hex, secret: Hex, recipient: Address) {
  return keccak256(
    encodePacked(
      ["bytes32", "bytes32", "address"],
      [paymentId, secret, recipient],
    ),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.split("\n")[0] ?? error.message;
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

  return "Transaction failed. Check wallet details and try again.";
}

function getPrivacyEscrowRevertMessage(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes('function "payments" reverted')) {
    return "Configured privSwiftPay escrow address is not a PrivSwiftPayEscrow contract on Arc Testnet. Deploy PrivSwiftPayEscrow.sol and update NEXT_PUBLIC_PRIVSWIFTPAY_ESCROW_ADDRESS.";
  }

  if (message.includes("PaymentAlreadyExists")) {
    return "This claim code payment was already funded. Generate a new code.";
  }

  if (message.includes("TokenTransferFailed")) {
    return "The escrow could not pull the token from your wallet. Confirm the approval finished and that your token balance is enough.";
  }

  if (message.includes("InvalidAmount")) {
    return "Enter a valid amount greater than zero.";
  }

  if (message.includes("InvalidCommitment")) {
    return "This generated claim code is invalid. Generate a new code and try again.";
  }

  return message;
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function encodePrivacyCode(payload: PrivacyCodePayload) {
  return `${codePrefix}${encodeBase64Url(JSON.stringify(payload))}`;
}

function isPrivacyCodePayload(value: unknown): value is PrivacyCodePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<PrivacyCodePayload>;

  return (
    payload.kind === "privswiftpay.payment" &&
    payload.version === 1 &&
    typeof payload.id === "string" &&
    typeof payload.sender === "string" &&
    typeof payload.recipient === "string" &&
    typeof payload.amount === "string" &&
    isBytes32Hex(payload.id) &&
    isBytes32Hex(payload.secret) &&
    isBytes32Hex(payload.commitment) &&
    typeof payload.createdAt === "string" &&
    arcTokenSymbols.includes(payload.token as ArcTokenSymbol) &&
    isAddress(payload.sender) &&
    isAddress(payload.recipient) &&
    isPositiveAmount(payload.amount)
  );
}

function parsePrivacyCode(code: string) {
  const cleaned = code.trim().replace(/^privswiftpay:/i, "");

  if (!cleaned) {
    throw new Error("Paste a payment claim code.");
  }

  const parsed = JSON.parse(decodeBase64Url(cleaned)) as unknown;

  if (!isPrivacyCodePayload(parsed)) {
    throw new Error("This is not a valid privSwiftPay claim code.");
  }

  return parsed;
}

function readStoredArray<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeStoredArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function buildWalletStorageKey(
  baseKey: string,
  walletKind: "circle" | "external",
  walletAddress: Address,
) {
  return `${baseKey}.${walletKind}.${walletAddress.toLowerCase()}`;
}

function markStoredSenderPaymentClaimed(payload: PrivacyCodePayload) {
  const senderAddress = getAddress(payload.sender);
  const walletKinds = ["circle", "external"] as const;

  for (const walletKind of walletKinds) {
    const key = buildWalletStorageKey(
      paymentStorageKey,
      walletKind,
      senderAddress,
    );
    const storedPayments = readStoredArray<StoredPrivacyPayment>(key);
    let changed = false;
    const nextPayments = storedPayments.map((payment) => {
      if (payment.id !== payload.id || payment.status === "claimed") {
        return payment;
      }

      changed = true;
      return { ...payment, status: "claimed" as const };
    });

    if (changed) {
      writeStoredArray(key, nextPayments);
    }
  }
}

export function PrivSwiftPayContent({
  feature = "private-send",
}: {
  feature?: PrivSwiftPayFeature;
}) {
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const {
    address: accountAddress,
    isConnected: isAccountConnected,
  } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [isMounted, setIsMounted] = useState(false);
  const [circleLogin, setCircleLogin] = useState<CircleLoginResult | null>(
    null,
  );
  const [walletMode, setWalletMode] = useState<WalletMode>("circle");
  const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
  const [isCircleLoading, setIsCircleLoading] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [payments, setPayments] = useState<StoredPrivacyPayment[]>([]);
  const [payrollFolders, setPayrollFolders] = useState<PayrollFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState("");

  const [recipientAddress, setRecipientAddress] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("25.00");
  const [paymentToken, setPaymentToken] = useState<ArcTokenSymbol>("USDC");
  const [paymentNote, setPaymentNote] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [sendStatus, setSendStatus] = useState("Ready");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendExplorerUrl, setSendExplorerUrl] = useState("");
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const [folderName, setFolderName] = useState("");
  const [folderDraftName, setFolderDraftName] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [employeeAmount, setEmployeeAmount] = useState("100.00");
  const [employeeToken, setEmployeeToken] = useState<ArcTokenSymbol>("USDC");
  const [payrollCodes, setPayrollCodes] = useState<PayrollCodeRecord[]>([]);
  const [payrollStatus, setPayrollStatus] = useState("No folder selected");
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [payrollExplorerUrl, setPayrollExplorerUrl] = useState("");
  const [isGeneratingPayroll, setIsGeneratingPayroll] = useState(false);

  const [claimCode, setClaimCode] = useState("");
  const [claimPayload, setClaimPayload] = useState<PrivacyCodePayload | null>(
    null,
  );
  const [claimStatus, setClaimStatus] = useState("Waiting for claim code");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimExplorerUrl, setClaimExplorerUrl] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);

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
  const walletLabel = isEmbeddedWalletMode
    ? "Circle wallet"
    : isExternalWalletMode
      ? "External wallet"
      : "Wallet";
  const walletStorageKind = isEmbeddedWalletMode ? "circle" : "external";
  const walletPaymentStorageKey = address
    ? buildWalletStorageKey(paymentStorageKey, walletStorageKind, address)
    : "";
  const walletPayrollStorageKey = address
    ? buildWalletStorageKey(payrollStorageKey, walletStorageKind, address)
    : "";
  const isArcNetwork =
    isEmbeddedWalletMode || (isExternalWalletMode && chainId === arcTestnet.id);
  const isEscrowConfigured = Boolean(escrowAddress);
  const isTransactionBusy =
    isGeneratingCode ||
    isGeneratingPayroll ||
    isClaiming ||
    isWritePending ||
    isSwitchingChain;
  const activeFolder = payrollFolders.find(
    (folder) => folder.id === activeFolderId,
  );
  const visiblePayments = useMemo(
    () =>
      address
        ? payments.filter(
            (payment) =>
              payment.payload.sender.toLowerCase() === address.toLowerCase(),
          )
        : [],
    [address, payments],
  );
  const claimWalletMatches = Boolean(
    claimPayload &&
      address &&
      claimPayload.recipient.toLowerCase() === address.toLowerCase(),
  );
  const totalPayrollAmount = useMemo(() => {
    if (!activeFolder) {
      return "0.00";
    }

    const total = activeFolder.recipients.reduce(
      (sum, recipient) => sum + Number(normalizeAmount(recipient.amount) || 0),
      0,
    );

    return total.toLocaleString(undefined, {
      maximumFractionDigits: 6,
      minimumFractionDigits: 2,
    });
  }, [activeFolder]);

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

  async function ensureArcNetwork() {
    if (isArcNetwork) {
      return true;
    }

    try {
      await switchChainAsync({ chainId: arcTestnet.id });
      return true;
    } catch (error) {
      setSendError(getErrorMessage(error));
      return false;
    }
  }

  async function waitForArcTransaction(
    hash: Hash,
    label: string,
    onStatus: (value: string) => void,
    waitForEffect?: () => Promise<boolean>,
  ) {
    const deadline = Date.now() + arcTransactionReceiptTimeoutMs;
    let lastError: unknown;

    onStatus(`Waiting for ${label} confirmation`);

    while (Date.now() < deadline) {
      if (waitForEffect) {
        try {
          if (await waitForEffect()) {
            onStatus(`${label} confirmed`);
            return;
          }
        } catch (error) {
          lastError = error;
        }
      }

      let receipt: Awaited<
        ReturnType<typeof arcPublicClient.getTransactionReceipt>
      >;

      try {
        receipt = await arcPublicClient.getTransactionReceipt({ hash });
      } catch (error) {
        lastError = error;
        await wait(arcTransactionReceiptPollMs);
        continue;
      }

      if (receipt.status !== "success") {
        throw new Error(`${label} transaction reverted.`);
      }

      onStatus(`${label} confirmed`);
      return receipt;
    }

    throw new Error(
      lastError instanceof Error
        ? `Timed out waiting for ${label} confirmation: ${lastError.message}`
        : `Timed out waiting for ${label} confirmation.`,
    );
  }

  async function waitForOnChainEffect(
    label: string,
    onStatus: (value: string) => void,
    waitForEffect: () => Promise<boolean>,
  ) {
    const deadline = Date.now() + arcTransactionReceiptTimeoutMs;
    let lastError: unknown;

    onStatus(`Waiting for ${label} confirmation`);

    while (Date.now() < deadline) {
      try {
        if (await waitForEffect()) {
          onStatus(`${label} confirmed`);
          return;
        }
      } catch (error) {
        lastError = error;
      }

      await wait(arcTransactionReceiptPollMs);
    }

    throw new Error(
      lastError instanceof Error
        ? `Timed out waiting for ${label} confirmation: ${lastError.message}`
        : `Timed out waiting for ${label} confirmation.`,
    );
  }

  async function hasEscrowAllowance(token: ArcTokenSymbol, amount: bigint) {
    if (!address) {
      return false;
    }

    const allowance = await arcPublicClient.readContract({
      address: arcTestnetTokens[token].address,
      abi: erc20AllowanceAbi,
      functionName: "allowance",
      args: [address, requireEscrowAddress()],
    });

    return allowance >= amount;
  }

  async function hasEnoughTokenBalance(token: ArcTokenSymbol, amount: bigint) {
    if (!address) {
      return false;
    }

    const balance = await arcPublicClient.readContract({
      address: arcTestnetTokens[token].address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });

    return balance >= amount;
  }

  async function requireTokenBalance(token: ArcTokenSymbol, amount: bigint) {
    if (!(await hasEnoughTokenBalance(token, amount))) {
      throw new Error(`Insufficient ${token} balance to fund this claim code.`);
    }
  }

  async function assertEscrowContractCompatible() {
    try {
      await arcPublicClient.readContract({
        address: requireEscrowAddress(),
        abi: privacyEscrowAbi,
        functionName: "payments",
        args: [escrowCompatibilityCheckId],
      });
    } catch (error) {
      throw new Error(getPrivacyEscrowRevertMessage(error));
    }
  }

  async function ensurePaymentCanBeFunded(payload: PrivacyCodePayload) {
    if (!address) {
      throw new Error("Connect a wallet before funding this claim code.");
    }

    await assertEscrowContractCompatible();

    const contractAddress = requireEscrowAddress();
    const amountUnits = getPaymentAmountUnits(payload.amount, payload.token);
    const tokenAddress = arcTestnetTokens[payload.token].address;

    if (await isPaymentFunded(payload)) {
      throw new Error("This claim code payment was already funded.");
    }

    try {
      await arcPublicClient.simulateContract({
        account: address,
        address: contractAddress,
        abi: privacyEscrowAbi,
        functionName: "depositPayment",
        args: [
          payload.id as Hex,
          tokenAddress,
          amountUnits,
          payload.commitment as Hex,
        ],
      });
    } catch (error) {
      throw new Error(getPrivacyEscrowRevertMessage(error));
    }
  }

  async function ensurePayrollCanBeFunded(payloads: PrivacyCodePayload[]) {
    if (!address) {
      throw new Error("Connect a wallet before funding payroll claim codes.");
    }

    await assertEscrowContractCompatible();

    const alreadyFunded = await Promise.all(
      payloads.map((payload) => isPaymentFunded(payload)),
    );

    if (alreadyFunded.some(Boolean)) {
      throw new Error(
        "At least one payroll claim code was already funded. Generate new payroll codes.",
      );
    }

    const paymentIds = payloads.map((payload) => payload.id as Hex);
    const tokens = payloads.map(
      (payload) => arcTestnetTokens[payload.token].address,
    );
    const amounts = payloads.map((payload) =>
      getPaymentAmountUnits(payload.amount, payload.token),
    );
    const commitments = payloads.map((payload) => payload.commitment as Hex);

    try {
      await arcPublicClient.simulateContract({
        account: address,
        address: requireEscrowAddress(),
        abi: privacyEscrowAbi,
        functionName: "depositPayments",
        args: [paymentIds, tokens, amounts, commitments],
      });
    } catch (error) {
      throw new Error(getPrivacyEscrowRevertMessage(error));
    }
  }

  async function isPaymentFunded(payload: PrivacyCodePayload) {
    const contractAddress = requireEscrowAddress();
    const tokenAddress = arcTestnetTokens[payload.token].address;
    const amountUnits = getPaymentAmountUnits(payload.amount, payload.token);
    const payment = (await arcPublicClient.readContract({
      address: contractAddress,
      abi: privacyEscrowAbi,
      functionName: "payments",
      args: [payload.id as Hex],
    })) as readonly [Address, bigint, Hex, boolean];
    const [storedToken, storedAmount, storedCommitment] = payment;

    return (
      storedToken.toLowerCase() === tokenAddress.toLowerCase() &&
      storedAmount >= amountUnits &&
      storedCommitment.toLowerCase() === payload.commitment.toLowerCase()
    );
  }

  async function isPaymentClaimed(payload: PrivacyCodePayload) {
    const payment = (await arcPublicClient.readContract({
      address: requireEscrowAddress(),
      abi: privacyEscrowAbi,
      functionName: "payments",
      args: [payload.id as Hex],
    })) as readonly [Address, bigint, Hex, boolean];
    const [, , , claimed] = payment;

    return claimed;
  }

  async function getCircleTransaction(transactionId: string) {
    if (!circleLogin) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    return callCircleWalletApi("getTransaction", {
      transactionId,
      userToken: circleLogin.userToken,
    });
  }

  async function tryGetCircleTransaction(transactionId: string) {
    try {
      return await getCircleTransaction(transactionId);
    } catch {
      return undefined;
    }
  }

  async function getCircleChallenge(challengeId: string) {
    if (!circleLogin) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    return callCircleWalletApi("getChallenge", {
      challengeId,
      userToken: circleLogin.userToken,
    });
  }

  async function listCircleTransactions(params: Record<string, unknown> = {}) {
    if (!circleLogin || !circleWallet?.id) {
      throw new Error("Embedded Circle wallet is not ready.");
    }

    return callCircleWalletApi("listTransactions", {
      pageSize: 50,
      userToken: circleLogin.userToken,
      walletId: circleWallet.id,
      ...params,
    });
  }

  async function findCircleTransactionByHash(txHash: Hash) {
    const payload = await listCircleTransactions({ txHash });

    return getCircleTransactions(payload).find(
      (transaction) =>
        findTransactionHash(transaction)?.toLowerCase() ===
        txHash.toLowerCase(),
    );
  }

  async function waitForCircleTransactionHashByRef({
    challengeId,
    contractAddress,
    refId,
    transactionId,
    walletId,
    onStatus,
  }: {
    challengeId?: string;
    contractAddress: Address;
    refId: string;
    transactionId?: string;
    walletId: string;
    onStatus: (value: string) => void;
  }): Promise<CircleRecoveredTransactionHash | undefined> {
    for (let attempt = 0; attempt < circleTransactionHashAttempts; attempt += 1) {
      const transactionIds = new Set<string>();

      if (transactionId) {
        transactionIds.add(transactionId);
      }

      if (challengeId) {
        const challengeDetail = await getCircleChallenge(challengeId);

        assertCircleChallengeDidNotFail(challengeDetail);

        for (const correlationId of getCircleCorrelationIds(challengeDetail)) {
          transactionIds.add(correlationId);
        }
      }

      for (const candidateTransactionId of transactionIds) {
        const detail = await tryGetCircleTransaction(candidateTransactionId);

        if (detail) {
          const detailHash = findTransactionHash(detail);

          if (detailHash) {
            return {
              transactionId: candidateTransactionId,
              txHash: detailHash,
            };
          }

          assertCircleTransactionDidNotFail(detail);
        }
      }

      const payload = await listCircleTransactions();
      const transaction = getCircleTransactions(payload).find((candidate) =>
        isMatchingCircleTransaction(
          candidate,
          refId,
          contractAddress,
          walletId,
        ),
      );

      if (transaction) {
        const txHash = findTransactionHash(transaction);

        if (txHash) {
          return {
            transactionId: getCircleTransactionId(transaction),
            txHash,
          };
        }

        assertCircleTransactionDidNotFail(transaction);

        const matchedTransactionId = getCircleTransactionId(transaction);

        if (matchedTransactionId) {
          const detail = await getCircleTransaction(matchedTransactionId);
          const detailHash = findTransactionHash(detail);

          if (detailHash) {
            return {
              transactionId: matchedTransactionId,
              txHash: detailHash,
            };
          }

          assertCircleTransactionDidNotFail(detail);
        }
      }

      onStatus(
        transaction
          ? "Waiting for Circle transaction hash"
          : "Finding Circle transaction",
      );
      await wait(circleTransactionHashDelayMs);
    }

    return undefined;
  }

  async function waitForCircleTransactionConfirmation({
    contractAddress,
    label,
    onStatus,
    refId,
    transactionId,
    txHash,
    walletId,
  }: {
    contractAddress: Address;
    label: string;
    onStatus: (value: string) => void;
    refId: string;
    transactionId?: string;
    txHash?: Hash;
    walletId: string;
  }) {
    const deadline = Date.now() + arcTransactionReceiptTimeoutMs;
    let lastError: unknown;

    onStatus(`Waiting for ${label} confirmation`);

    while (Date.now() < deadline) {
      if (txHash) {
        let receipt:
          | Awaited<ReturnType<typeof arcPublicClient.getTransactionReceipt>>
          | undefined;

        try {
          receipt = await arcPublicClient.getTransactionReceipt({
            hash: txHash,
          });
        } catch (error) {
          lastError = error;
        }

        if (receipt) {
          if (receipt.status !== "success") {
            throw new Error(`${label} transaction reverted.`);
          }

          onStatus(`${label} confirmed`);
          return;
        }
      }

      if (transactionId) {
        const transaction = await tryGetCircleTransaction(transactionId);

        if (transaction) {
          assertCircleTransactionDidNotFail(transaction);

          if (isCircleTransactionComplete(transaction)) {
            onStatus(`${label} confirmed`);
            return;
          }
        }
      }

      try {
        const transaction = txHash
          ? await findCircleTransactionByHash(txHash)
          : getCircleTransactions(await listCircleTransactions()).find(
              (candidate) =>
                isMatchingCircleTransaction(
                  candidate,
                  refId,
                  contractAddress,
                  walletId,
                ),
            );

        if (transaction) {
          assertCircleTransactionDidNotFail(transaction);

          if (isCircleTransactionComplete(transaction)) {
            onStatus(`${label} confirmed`);
            return;
          }
        }
      } catch (error) {
        lastError = error;
      }

      await wait(arcTransactionReceiptPollMs);
    }

    throw new Error(
      lastError instanceof Error
        ? `Timed out waiting for ${label} confirmation: ${lastError.message}`
        : `Timed out waiting for ${label} confirmation.`,
    );
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsStorageReady(false);
    setGeneratedCode("");
    setSendExplorerUrl("");
    setCopiedCodeId(null);
    setPayrollCodes([]);
    setPayrollExplorerUrl("");
    setPayrollError(null);

    if (!walletPaymentStorageKey || !walletPayrollStorageKey) {
      setPayments([]);
      setPayrollFolders([]);
      setActiveFolderId("");
      setFolderDraftName("");
      setPayrollStatus("Connect a wallet to load folders");
      return;
    }

    const storedFolders = readStoredArray<PayrollFolder>(walletPayrollStorageKey);
    const storedPayments = readStoredArray<StoredPrivacyPayment>(
      walletPaymentStorageKey,
    ).filter(
      (payment) =>
        address &&
        payment.payload.sender.toLowerCase() === address.toLowerCase(),
    );

    setPayments(storedPayments);
    setPayrollFolders(storedFolders);
    setActiveFolderId(storedFolders[0]?.id ?? "");
    setFolderDraftName(storedFolders[0]?.name ?? "");
    setPayrollStatus(
      storedFolders[0]
        ? `${storedFolders[0].name} selected`
        : "Create a payroll folder",
    );
    setIsStorageReady(true);
  }, [walletPaymentStorageKey, walletPayrollStorageKey]);

  useEffect(() => {
    if (isStorageReady && walletPaymentStorageKey) {
      writeStoredArray(walletPaymentStorageKey, payments);
    }
  }, [isStorageReady, payments, walletPaymentStorageKey]);

  useEffect(() => {
    if (!isEscrowConfigured || visiblePayments.length === 0) {
      return;
    }

    const readyPayments = visiblePayments.filter(
      (payment) => payment.status !== "claimed",
    );

    if (readyPayments.length === 0) {
      return;
    }

    let cancelled = false;

    async function refreshClaimedPayments() {
      const claimedIds = (
        await Promise.all(
          readyPayments.map(async (payment) => {
            try {
              return (await isPaymentClaimed(payment.payload))
                ? payment.id
                : null;
            } catch {
              return null;
            }
          }),
        )
      ).filter((paymentId): paymentId is string => Boolean(paymentId));

      if (cancelled || claimedIds.length === 0) {
        return;
      }

      const claimedIdSet = new Set(claimedIds);

      setPayments((currentPayments) => {
        let changed = false;
        const nextPayments = currentPayments.map((payment) => {
          if (!claimedIdSet.has(payment.id) || payment.status === "claimed") {
            return payment;
          }

          changed = true;
          return { ...payment, status: "claimed" as const };
        });

        return changed ? nextPayments : currentPayments;
      });
    }

    void refreshClaimedPayments();
    const intervalId = window.setInterval(
      () => void refreshClaimedPayments(),
      claimedPaymentRefreshMs,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isEscrowConfigured, visiblePayments]);

  useEffect(() => {
    if (isStorageReady && walletPayrollStorageKey) {
      writeStoredArray(walletPayrollStorageKey, payrollFolders);
    }
  }, [isStorageReady, payrollFolders, walletPayrollStorageKey]);

  useEffect(() => {
    setFolderDraftName(activeFolder?.name ?? "");
  }, [activeFolder?.name]);

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
        const wallets = payload.wallets ?? [];

        if (!cancelled) {
          setCircleWallets(wallets);
          writeCircleWallets(wallets);
        }
      } catch {
        if (!cancelled && cachedWallets.length === 0) {
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

  function requireEscrowAddress() {
    if (!escrowAddress) {
      throw new Error(
        "Set NEXT_PUBLIC_PRIVSWIFTPAY_ESCROW_ADDRESS to a deployed privSwiftPay escrow contract.",
      );
    }

    return escrowAddress;
  }

  function getPaymentAmountUnits(amount: string, token: ArcTokenSymbol) {
    try {
      return parseUnits(normalizeAmount(amount), arcTestnetTokens[token].decimals);
    } catch {
      throw new Error("Enter a valid amount with up to 6 decimals.");
    }
  }

  async function executeCircleChallenge(
    challengeId: string,
    label: string,
    onStatus: (value: string) => void = setSendStatus,
  ) {
    if (!circleLogin) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    const sdk = await ensureCircleSdk(circleLogin);

    sdk.setAuthentication({
      encryptionKey: circleLogin.encryptionKey,
      userToken: circleLogin.userToken,
    });

    return new Promise<{ transactionId?: string; txHash?: Hash }>(
      (resolve, reject) => {
        onStatus(`Confirm ${label} in Circle wallet`);
        sdk.execute(challengeId, (error, result) => {
          if (error) {
            reject(new Error(getErrorMessage(error)));
            return;
          }

          const challengeResult = result as CircleChallengeResult | undefined;
          resolve({
            transactionId: getCircleTransactionId(challengeResult),
            txHash: findTransactionHash(challengeResult),
          });
        });
      },
    );
  }

  async function executeCircleContract({
    callData,
    contractAddress,
    label,
    onStatus,
    refId,
  }: {
    callData: Hex;
    contractAddress: Address;
    label: string;
    onStatus?: (value: string) => void;
    refId?: string;
  }) {
    if (!circleLogin || !circleWallet?.id) {
      throw new Error("Embedded Circle wallet is not ready.");
    }

    const statusHandler = onStatus ?? setSendStatus;
    const transactionRefId =
      refId ?? `privswiftpay-${label.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}`;
    const challenge = await callCircleWalletApi<CircleContractChallenge>(
      "createContractExecution",
      {
        callData,
        contractAddress,
        feeLevel: "MEDIUM",
        refId: transactionRefId,
        userToken: circleLogin.userToken,
        walletId: circleWallet.id,
      },
    );
    const challengeId = getCircleChallengeId(challenge);
    let transactionId = getCircleTransactionId(challenge);
    let txHash = findTransactionHash(challenge);

    if (challengeId) {
      const challengeResult = await executeCircleChallenge(
        challengeId,
        label,
        statusHandler,
      );

      transactionId = transactionId ?? challengeResult.transactionId;
      txHash = challengeResult.txHash ?? txHash;
    } else if (!txHash) {
      throw new Error("Circle did not return a contract challenge.");
    }

    if (!txHash) {
      const recoveredTransaction = await waitForCircleTransactionHashByRef({
        challengeId,
        contractAddress,
        onStatus: statusHandler,
        refId: transactionRefId,
        transactionId,
        walletId: circleWallet.id,
      });

      transactionId = recoveredTransaction?.transactionId ?? transactionId;
      txHash = recoveredTransaction?.txHash;
    }

    await waitForCircleTransactionConfirmation({
      contractAddress,
      label,
      onStatus: statusHandler,
      refId: transactionRefId,
      transactionId,
      txHash,
      walletId: circleWallet.id,
    });

    return { transactionId, txHash };
  }

  async function approveEscrow(
    token: ArcTokenSymbol,
    amount: bigint,
    onStatus: (value: string) => void = setSendStatus,
  ) {
    const contractAddress = requireEscrowAddress();
    const tokenAddress = arcTestnetTokens[token].address;

    if (isEmbeddedWalletMode) {
      onStatus(`Check ${token} escrow approval`);
      if (await hasEscrowAllowance(token, amount)) {
        onStatus(`${token} approval confirmed`);
        return { txHash: undefined };
      }

      onStatus(`Approve ${token} in Circle wallet`);
      const approvalResult = await executeCircleContract({
        callData: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddress, amount],
        }),
        contractAddress: tokenAddress,
        label: `Approve ${token} for privacy escrow`,
        onStatus,
        refId: `privswiftpay-approve-${token}-${Date.now()}`,
      });

      await waitForOnChainEffect(`${token} approval`, onStatus, () =>
        hasEscrowAllowance(token, amount),
      );

      return approvalResult;
    }

    if (!(await ensureArcNetwork())) {
      throw new Error("Switch to Arc Testnet before funding privSwiftPay.");
    }

    onStatus(`Check ${token} escrow approval`);
    if (await hasEscrowAllowance(token, amount)) {
      onStatus(`${token} approval confirmed`);
      return { txHash: undefined };
    }

    onStatus(`Approve ${token} escrow`);
    const hash = await writeContractAsync({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [contractAddress, amount],
      chainId: arcTestnet.id,
    });

    await waitForArcTransaction(hash, `${token} approval`, onStatus, () =>
      hasEscrowAllowance(token, amount),
    );

    return { txHash: hash };
  }

  async function fundSinglePayment(payload: PrivacyCodePayload) {
    const contractAddress = requireEscrowAddress();
    const amountUnits = getPaymentAmountUnits(payload.amount, payload.token);
    const tokenAddress = arcTestnetTokens[payload.token].address;

    await assertEscrowContractCompatible();
    await requireTokenBalance(payload.token, amountUnits);
    await approveEscrow(payload.token, amountUnits);
    setSendStatus("Check escrow funding");
    await ensurePaymentCanBeFunded(payload);

    if (isEmbeddedWalletMode) {
      setSendStatus("Fund privacy escrow in Circle wallet");
      const fundingResult = await executeCircleContract({
        callData: encodeFunctionData({
          abi: privacyEscrowAbi,
          functionName: "depositPayment",
          args: [
            payload.id as Hex,
            tokenAddress,
            amountUnits,
            payload.commitment as Hex,
          ],
        }),
        contractAddress,
        label: "Fund privacy escrow",
        refId: `privswiftpay-deposit-${payload.id.slice(2, 10)}`,
      });

      await waitForOnChainEffect(
        "privacy escrow funding",
        setSendStatus,
        () => isPaymentFunded(payload),
      );

      return fundingResult;
    }

    setSendStatus("Fund privacy escrow");
    const hash = await writeContractAsync({
      address: contractAddress,
      abi: privacyEscrowAbi,
      functionName: "depositPayment",
      args: [
        payload.id as Hex,
        tokenAddress,
        amountUnits,
        payload.commitment as Hex,
      ],
      chainId: arcTestnet.id,
    });

    await waitForArcTransaction(
      hash,
      "privacy escrow funding",
      setSendStatus,
      () => isPaymentFunded(payload),
    );

    return { txHash: hash };
  }

  async function fundPayrollPayments(payloads: PrivacyCodePayload[]) {
    const contractAddress = requireEscrowAddress();

    if (payloads.length === 0) {
      throw new Error("Add at least one employee to the folder.");
    }

    if (!isEmbeddedWalletMode && !(await ensureArcNetwork())) {
      throw new Error("Switch to Arc Testnet before funding payroll.");
    }

    await assertEscrowContractCompatible();

    const totalsByToken = payloads.reduce(
      (totals, payload) => {
        totals[payload.token] += getPaymentAmountUnits(
          payload.amount,
          payload.token,
        );
        return totals;
      },
      { EURC: BigInt(0), USDC: BigInt(0) } satisfies Record<
        ArcTokenSymbol,
        bigint
      >,
    );

    for (const token of arcTokenSymbols) {
      if (totalsByToken[token] > BigInt(0)) {
        await requireTokenBalance(token, totalsByToken[token]);
        await approveEscrow(token, totalsByToken[token], setPayrollStatus);
      }
    }

    setPayrollStatus("Check payroll escrow funding");
    await ensurePayrollCanBeFunded(payloads);

    const paymentIds = payloads.map((payload) => payload.id as Hex);
    const tokens = payloads.map(
      (payload) => arcTestnetTokens[payload.token].address,
    );
    const amounts = payloads.map((payload) =>
      getPaymentAmountUnits(payload.amount, payload.token),
    );
    const commitments = payloads.map((payload) => payload.commitment as Hex);

    if (isEmbeddedWalletMode) {
      setPayrollStatus("Fund payroll escrow in Circle wallet");
      const fundingResult = await executeCircleContract({
        callData: encodeFunctionData({
          abi: privacyEscrowAbi,
          functionName: "depositPayments",
          args: [paymentIds, tokens, amounts, commitments],
        }),
        contractAddress,
        label: "Fund payroll privacy escrow",
        onStatus: setPayrollStatus,
        refId: `privswiftpay-payroll-${Date.now()}`,
      });

      await waitForOnChainEffect(
        "payroll privacy escrow funding",
        setPayrollStatus,
        async () => {
          const funded = await Promise.all(
            payloads.map((payload) => isPaymentFunded(payload)),
          );

          return funded.every(Boolean);
        },
      );

      return fundingResult;
    }

    setPayrollStatus("Fund payroll privacy escrow");
    const hash = await writeContractAsync({
      address: contractAddress,
      abi: privacyEscrowAbi,
      functionName: "depositPayments",
      args: [paymentIds, tokens, amounts, commitments],
      chainId: arcTestnet.id,
    });

    await waitForArcTransaction(
      hash,
      "payroll privacy escrow funding",
      setPayrollStatus,
      async () => {
        const funded = await Promise.all(
          payloads.map((payload) => isPaymentFunded(payload)),
        );

        return funded.every(Boolean);
      },
    );

    return { txHash: hash };
  }

  function savePaymentRecord(code: string, payload: PrivacyCodePayload) {
    const paymentRecord = {
      code,
      createdAt: payload.createdAt,
      id: payload.id,
      payload,
      status: "ready",
    } satisfies StoredPrivacyPayment;

    setPayments((currentPayments) => [
      paymentRecord,
      ...currentPayments.filter((payment) => payment.id !== payload.id),
    ].slice(0, 20));
  }

  async function createPaymentCode({
    amount,
    note,
    recipient,
    token,
  }: {
    amount: string;
    note?: string;
    recipient: string;
    token: ArcTokenSymbol;
  }) {
    if (!address) {
      throw new Error("Connect a wallet before creating a privacy code.");
    }

    if (!isAddress(recipient)) {
      throw new Error("Enter a valid receiver wallet address.");
    }

    if (!isPositiveAmount(amount)) {
      throw new Error("Enter a valid amount with up to 6 decimals.");
    }

    const id = randomBytes32();
    const secret = randomBytes32();
    const normalizedAmount = normalizeAmount(amount);
    const normalizedSender = getAddress(address);
    const normalizedRecipient = getAddress(recipient);
    const createdAt = new Date().toISOString();
    const commitment = buildCommitment(id, secret, normalizedRecipient);
    const payload: PrivacyCodePayload = {
      amount: normalizedAmount,
      chainId: arcTestnet.id,
      commitment,
      createdAt,
      id,
      kind: "privswiftpay.payment",
      network: arcTestnet.name,
      note: note?.trim() || undefined,
      pool: "swiftpay-privacy-pool",
      recipient: normalizedRecipient,
      secret,
      sender: normalizedSender,
      token,
      version: 1,
    };
    const code = encodePrivacyCode(payload);

    return { code, payload };
  }

  async function copyToClipboard(value: string, id: string) {
    if (typeof navigator === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopiedCodeId(id);
    window.setTimeout(() => setCopiedCodeId(null), 1600);
  }

  async function handleGeneratePaymentCode() {
    setSendError(null);
    setGeneratedCode("");
    setSendExplorerUrl("");

    try {
      setIsGeneratingCode(true);
      setSendStatus("Creating and funding claim code");
      const result = await createPaymentCode({
        amount: paymentAmount,
        note: paymentNote,
        recipient: recipientAddress,
        token: paymentToken,
      });
      const fundingResult = await fundSinglePayment(result.payload);

      savePaymentRecord(result.code, result.payload);
      setGeneratedCode(result.code);
      setSendExplorerUrl(
        fundingResult.txHash
          ? `${arcTestnet.blockExplorers.default.url}/tx/${fundingResult.txHash}`
          : "",
      );
      setSendStatus("Funded claim code ready");
    } catch (error) {
      setSendError(getErrorMessage(error));
      setSendStatus("Ready");
    } finally {
      setIsGeneratingCode(false);
    }
  }

  function handleCreateFolder() {
    setPayrollError(null);

    if (!address) {
      setPayrollError("Connect a wallet before creating a payroll folder.");
      setPayrollStatus("Wallet required");
      return;
    }

    const trimmedName = folderName.trim();

    if (!trimmedName) {
      setPayrollError("Enter a payroll folder name.");
      return;
    }

    const folder: PayrollFolder = {
      createdAt: new Date().toISOString(),
      id: createId(),
      name: trimmedName,
      recipients: [],
    };

    setPayrollFolders((currentFolders) => [folder, ...currentFolders]);
    setActiveFolderId(folder.id);
    setFolderDraftName(folder.name);
    setFolderName("");
    setPayrollCodes([]);
    setPayrollStatus(`${folder.name} created`);
  }

  function handleRenameFolder() {
    setPayrollError(null);

    if (!activeFolder) {
      setPayrollError("Select a payroll folder first.");
      return;
    }

    const nextName = folderDraftName.trim();

    if (!nextName) {
      setPayrollError("Folder name cannot be empty.");
      return;
    }

    setPayrollFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === activeFolder.id ? { ...folder, name: nextName } : folder,
      ),
    );
    setPayrollStatus(`${nextName} updated`);
  }

  function handleAddEmployee() {
    setPayrollError(null);

    if (!activeFolder) {
      setPayrollError("Create or select a payroll folder first.");
      return;
    }

    const trimmedName = employeeName.trim();

    if (!trimmedName) {
      setPayrollError("Enter an employee name.");
      return;
    }

    if (!isAddress(employeeAddress)) {
      setPayrollError("Enter a valid employee wallet address.");
      return;
    }

    if (!isPositiveAmount(employeeAmount)) {
      setPayrollError("Enter a valid payroll amount.");
      return;
    }

    const recipient: PayrollRecipient = {
      address: getAddress(employeeAddress),
      amount: normalizeAmount(employeeAmount),
      id: createId(),
      name: trimmedName,
      token: employeeToken,
    };

    setPayrollFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === activeFolder.id
          ? { ...folder, recipients: [...folder.recipients, recipient] }
          : folder,
      ),
    );
    setEmployeeName("");
    setEmployeeAddress("");
    setPayrollCodes([]);
    setPayrollStatus(`${recipient.name} added`);
  }

  function handleRemoveEmployee(recipientId: string) {
    if (!activeFolder) {
      return;
    }

    setPayrollFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === activeFolder.id
          ? {
              ...folder,
              recipients: folder.recipients.filter(
                (recipient) => recipient.id !== recipientId,
              ),
            }
          : folder,
      ),
    );
    setPayrollCodes((currentCodes) =>
      currentCodes.filter((code) => code.id !== recipientId),
    );
    setPayrollStatus("Recipient removed");
  }

  async function handleGeneratePayrollCodes() {
    setPayrollError(null);
    setPayrollCodes([]);
    setPayrollExplorerUrl("");

    if (!activeFolder) {
      setPayrollError("Select a payroll folder first.");
      return;
    }

    if (activeFolder.recipients.length === 0) {
      setPayrollError("Add at least one employee to the folder.");
      return;
    }

    try {
      setIsGeneratingPayroll(true);
      setPayrollStatus("Creating payroll claim codes");
      const generatedCodes = await Promise.all(
        activeFolder.recipients.map(async (recipient) => {
          const result = await createPaymentCode({
            amount: recipient.amount,
            note: `Payroll: ${activeFolder.name} - ${recipient.name}`,
            recipient: recipient.address,
            token: recipient.token,
          });

          return {
            code: result.code,
            employeeName: recipient.name,
            id: recipient.id,
            payload: result.payload,
          };
        }),
      );
      const fundingResult = await fundPayrollPayments(
        generatedCodes.map((record) => record.payload),
      );

      for (const record of generatedCodes) {
        savePaymentRecord(record.code, record.payload);
      }

      setPayrollCodes(generatedCodes);
      setPayrollExplorerUrl(
        fundingResult.txHash
          ? `${arcTestnet.blockExplorers.default.url}/tx/${fundingResult.txHash}`
          : "",
      );
      setPayrollStatus(`${generatedCodes.length} payroll code(s) funded`);
    } catch (error) {
      setPayrollError(getErrorMessage(error));
      setPayrollStatus(activeFolder.name);
    } finally {
      setIsGeneratingPayroll(false);
    }
  }

  function handleInspectClaimCode() {
    setClaimError(null);
    setClaimPayload(null);

    try {
      const payload = parsePrivacyCode(claimCode);
      setClaimPayload(payload);

      if (!address) {
        setClaimStatus("Connect the receiver wallet to verify this code");
        return;
      }

      if (payload.recipient.toLowerCase() !== address.toLowerCase()) {
        setClaimError(
          `This code belongs to ${shortenAddress(payload.recipient)}, not ${shortenAddress(address)}.`,
        );
        setClaimStatus("Receiver wallet mismatch");
        return;
      }

      setClaimStatus("Receiver wallet matched");
    } catch (error) {
      setClaimError(
        error instanceof Error ? error.message : "Claim code could not be read.",
      );
      setClaimStatus("Waiting for claim code");
    }
  }

  async function claimFundedPayment(payload: PrivacyCodePayload) {
    const contractAddress = requireEscrowAddress();

    await assertEscrowContractCompatible();

    if (isEmbeddedWalletMode) {
      setClaimStatus("Confirm claim in Circle wallet");
      return executeCircleContract({
        callData: encodeFunctionData({
          abi: privacyEscrowAbi,
          functionName: "claimPayment",
          args: [payload.id as Hex, payload.secret as Hex],
        }),
        contractAddress,
        label: "Claim privacy payment",
        onStatus: setClaimStatus,
        refId: `privswiftpay-claim-${payload.id.slice(2, 10)}`,
      });
    }

    if (!(await ensureArcNetwork())) {
      throw new Error("Switch to Arc Testnet before claiming privSwiftPay funds.");
    }

    setClaimStatus("Submit claim transaction");
    const hash = await writeContractAsync({
      address: contractAddress,
      abi: privacyEscrowAbi,
      functionName: "claimPayment",
      args: [payload.id as Hex, payload.secret as Hex],
      chainId: arcTestnet.id,
    });

    await waitForArcTransaction(hash, "privacy claim", setClaimStatus, () =>
      isPaymentClaimed(payload),
    );

    return { txHash: hash };
  }

  async function handleClaimCode() {
    setClaimError(null);
    setClaimExplorerUrl("");

    if (!claimPayload) {
      handleInspectClaimCode();
      return;
    }

    if (!address) {
      setClaimError("Connect the receiver wallet before claiming.");
      setClaimStatus("Wallet required");
      return;
    }

    if (!claimWalletMatches) {
      setClaimError(
        `Connect ${shortenAddress(claimPayload.recipient)} to claim this code.`,
      );
      setClaimStatus("Receiver wallet mismatch");
      return;
    }

    try {
      setIsClaiming(true);
      const claimResult = await claimFundedPayment(claimPayload);
      markStoredSenderPaymentClaimed(claimPayload);
      setPayments((currentPayments) =>
        currentPayments.map((payment) =>
          payment.id === claimPayload.id
            ? { ...payment, status: "claimed" }
            : payment,
        ),
      );
      setClaimExplorerUrl(
        claimResult.txHash
          ? `${arcTestnet.blockExplorers.default.url}/tx/${claimResult.txHash}`
          : "",
      );
      setClaimStatus("Claim transaction submitted");
    } catch (error) {
      setClaimError(getErrorMessage(error));
      setClaimStatus("Claim failed");
    } finally {
      setIsClaiming(false);
    }
  }

  function handleCircleSessionCleared() {
    circleSdkRef.current = null;
    setCircleLogin(null);
    setCircleWallets([]);
    setWalletMode("circle");
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="surface-panel sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link
            className="flex min-w-0 items-center gap-3 justify-self-start"
            href="/"
          >
            <BrandMark className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="truncate text-sm font-semibold text-muted sm:text-base">
                Stablecoins Privacy payment desk
              </p>
            </div>
          </Link>

          <div className="flex min-w-0 items-center gap-2 justify-self-start lg:justify-self-end">
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
        <nav
          aria-label="privSwiftPay features"
          className="flex flex-wrap gap-2 rounded-lg border border-lavender-100 bg-white/85 p-1 shadow-sm"
        >
          {featureNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = feature === item.feature;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition sm:flex-none ${
                  isActive
                    ? "bg-swift-600 text-white shadow-[0_10px_24px_rgba(66,17,143,0.2)]"
                    : "text-ink hover:bg-lavender-50 hover:text-swift-700"
                }`}
                href={item.href}
                key={item.feature}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {feature === "private-send" ? (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="surface-panel p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">Private send</p>
                <h1 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                  Create claim code
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Build a receiver-bound payment code for a privacy-pool claim.
                </p>
              </div>
              <div className="inline-flex h-11 items-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-3 text-sm font-bold text-ink shadow-sm">
                <ShieldCheck className="h-4 w-4 text-swift-700" />
                {shortenAddress(address)}
              </div>
            </div>

            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-ink">
                  Receiver wallet
                </span>
                <div className="field-shell flex h-12 items-center gap-2 px-3">
                  <Wallet className="h-4 w-4 text-swift-600" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-muted"
                    onChange={(event) => setRecipientAddress(event.target.value)}
                    placeholder="0x..."
                    value={recipientAddress}
                  />
                </div>
              </label>

              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-ink">Amount</span>
                  <input
                    className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                    inputMode="decimal"
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder="0.00"
                    value={paymentAmount}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-ink">Asset</span>
                  <select
                    className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                    onChange={(event) =>
                      setPaymentToken(event.target.value as ArcTokenSymbol)
                    }
                    value={paymentToken}
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
                <span className="text-sm font-semibold text-ink">Note</span>
                <textarea
                  className="min-h-24 resize-y rounded-lg border border-lavender-200/90 bg-white/80 px-3 py-3 text-sm font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                  onChange={(event) => setPaymentNote(event.target.value)}
                  placeholder="Optional payment note"
                  value={paymentNote}
                />
              </label>

              {sendError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{sendError}</span>
                </div>
              ) : null}

              {!isEscrowConfigured ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    Add NEXT_PUBLIC_PRIVSWIFTPAY_ESCROW_ADDRESS to enable real
                    escrow deposits and claims.
                  </span>
                </div>
              ) : null}

              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
                disabled={isTransactionBusy || !address || !isEscrowConfigured}
                onClick={handleGeneratePaymentCode}
                type="button"
              >
                {isGeneratingCode || isWritePending || isSwitchingChain ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LockKeyhole className="h-4 w-4" />
                )}
                {!address
                  ? "Connect wallet"
                  : !isEscrowConfigured
                    ? "Escrow not configured"
                    : isGeneratingCode || isWritePending || isSwitchingChain
                      ? "Funding code"
                      : "Fund and generate code"}
              </button>

              {sendExplorerUrl ? (
                <a
                  className="inline-flex items-center gap-2 text-sm font-bold text-swift-700 transition hover:text-swift-600"
                  href={sendExplorerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  View escrow deposit on ArcScan
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}

              {generatedCode ? (
                <div className="rounded-lg border border-lavender-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-swift-700">
                      {sendStatus}
                    </span>
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-ink px-3 text-xs font-bold text-white transition hover:bg-swift-700"
                      onClick={() => void copyToClipboard(generatedCode, "send")}
                      type="button"
                    >
                      {copiedCodeId === "send" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedCodeId === "send" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="max-h-28 overflow-y-auto break-all rounded-lg bg-lavender-50 px-3 py-3 font-mono text-xs font-bold leading-5 text-ink">
                    {generatedCode}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="surface-card px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Wallet</p>
                  <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
                    {walletLabel}
                  </h2>
                </div>
                <Wallet className="h-5 w-5 text-swift-600" />
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Address</span>
                  <span className="font-mono text-xs font-bold text-ink">
                    {shortenAddress(address)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Network</span>
                  <span className="text-right font-bold text-ink">
                    {arcTestnet.name}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Pool status</span>
                  <span className="text-right font-bold text-swift-700">
                    {isEscrowConfigured ? "Escrow ready" : "Escrow missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Session</span>
                  <span className="text-right font-bold text-ink">
                    {isCircleLoading ? "Loading Circle wallet" : sendStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="surface-card px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Recent</p>
                  <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
                    Privacy codes
                  </h2>
                </div>
                <FileLock2 className="h-5 w-5 text-swift-600" />
              </div>
              <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto pr-1">
                {visiblePayments.length === 0 ? (
                  <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-4 py-4 text-sm font-semibold text-muted">
                    {address
                      ? "No claim codes generated yet."
                      : "Connect a wallet to load this profile's claim codes."}
                  </div>
                ) : (
                  visiblePayments.map((payment) => (
                    <article
                      className="rounded-lg border border-lavender-100 bg-white/85 px-3 py-3 shadow-sm"
                      key={payment.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-bold text-ink">
                            <TokenIcon
                              className="h-4 w-4 shrink-0 rounded-full"
                              symbol={payment.payload.token}
                            />
                            <span className="truncate">
                              {payment.payload.amount}
                            </span>
                            <span className="shrink-0">
                              {payment.payload.token}
                            </span>
                          </p>
                          <p className="truncate text-xs font-semibold text-muted">
                            To {shortenAddress(payment.payload.recipient)} -{" "}
                            {formatCodeTime(payment.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-black uppercase ${
                            payment.status === "claimed"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-lavender-100 text-swift-700"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </div>
                      <button
                        className="mt-3 inline-flex h-8 items-center justify-center gap-1 rounded-md border border-lavender-100 bg-white px-2 text-xs font-bold text-ink transition hover:border-swift-600 hover:text-swift-700"
                        onClick={() => void copyToClipboard(payment.code, payment.id)}
                        type="button"
                      >
                        {copiedCodeId === payment.id ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedCodeId === payment.id ? "Copied" : "Copy code"}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {feature === "payroll" ? (
        <section className="surface-panel p-4 sm:p-5">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Payroll</p>
              <h2 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                Payment folders
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Save employee groups and generate receiver-bound claim codes in
                one batch.
              </p>
            </div>
            <div className="inline-flex h-11 items-center gap-2 rounded-lg border border-lavender-200 bg-white/80 px-3 text-sm font-bold text-ink shadow-sm">
              <Folder className="h-4 w-4 text-swift-700" />
              {payrollFolders.length} folders
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-4">
              <div className="surface-card px-4 py-4">
                <div className="grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">
                      New folder
                    </span>
                    <input
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) => setFolderName(event.target.value)}
                      placeholder="Monthly payroll"
                      value={folderName}
                    />
                  </label>
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300"
                    disabled={!address}
                    onClick={handleCreateFolder}
                    type="button"
                  >
                    <FolderPlus className="h-4 w-4" />
                    {address ? "Save folder" : "Connect wallet"}
                  </button>
                </div>
              </div>

              <div className="surface-card px-4 py-4">
                <p className="text-sm font-black text-ink">Folders</p>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                  {payrollFolders.length === 0 ? (
                    <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-3 py-3 text-sm font-semibold text-muted">
                      {address
                        ? "Create a folder to begin."
                        : "Connect a wallet to load folders."}
                    </div>
                  ) : (
                    payrollFolders.map((folder) => (
                      <button
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm transition hover:border-swift-600 ${
                          activeFolderId === folder.id
                            ? "border-swift-600 bg-swift-600 text-white"
                            : "border-lavender-100 bg-white/85 text-ink"
                        }`}
                        key={folder.id}
                        onClick={() => {
                          setActiveFolderId(folder.id);
                          setPayrollCodes([]);
                          setPayrollStatus(`${folder.name} selected`);
                        }}
                        type="button"
                      >
                        <span className="min-w-0 truncate font-bold">
                          {folder.name}
                        </span>
                        <span className="shrink-0 text-xs font-black opacity-75">
                          {folder.recipients.length}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="surface-card px-4 py-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="grid flex-1 gap-2">
                    <span className="text-sm font-semibold text-ink">
                      Selected folder
                    </span>
                    <input
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15 disabled:bg-lavender-50 disabled:text-muted"
                      disabled={!activeFolder}
                      onChange={(event) => setFolderDraftName(event.target.value)}
                      placeholder="Select folder"
                      value={folderDraftName}
                    />
                  </label>
                  <button
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-4 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-100 disabled:text-muted"
                    disabled={!activeFolder}
                    onClick={handleRenameFolder}
                    type="button"
                  >
                    <Folder className="h-4 w-4" />
                    Update
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">Name</span>
                    <input
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) => setEmployeeName(event.target.value)}
                      placeholder="Employee name"
                      value={employeeName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">
                      Wallet address
                    </span>
                    <input
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) => setEmployeeAddress(event.target.value)}
                      placeholder="0x..."
                      value={employeeAddress}
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">
                      Amount
                    </span>
                    <input
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      inputMode="decimal"
                      onChange={(event) => setEmployeeAmount(event.target.value)}
                      placeholder="0.00"
                      value={employeeAmount}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-ink">Asset</span>
                    <select
                      className="h-12 rounded-lg border border-lavender-200/90 bg-white/80 px-3 text-sm font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                      onChange={(event) =>
                        setEmployeeToken(event.target.value as ArcTokenSymbol)
                      }
                      value={employeeToken}
                    >
                      {arcTokenSymbols.map((symbol) => (
                        <option key={symbol} value={symbol}>
                          {symbol}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-swift-600 px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(66,17,143,0.2)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0"
                    onClick={handleAddEmployee}
                    type="button"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add
                  </button>
                </div>

                {payrollError ? (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{payrollError}</span>
                  </div>
                ) : null}
              </div>

              <div className="surface-card px-4 py-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-ink">
                      {activeFolder?.name ?? "No folder selected"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted">
                      {activeFolder?.recipients.length ?? 0} recipients -{" "}
                      {totalPayrollAmount} total
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300"
                    disabled={
                      !address ||
                      !isEscrowConfigured ||
                      !activeFolder ||
                      activeFolder.recipients.length === 0 ||
                      isTransactionBusy
                    }
                    onClick={handleGeneratePayrollCodes}
                    type="button"
                  >
                    {isGeneratingPayroll || isWritePending || isSwitchingChain ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MailCheck className="h-4 w-4" />
                    )}
                    {!address
                      ? "Connect wallet"
                      : !isEscrowConfigured
                        ? "Escrow missing"
                        : isGeneratingPayroll || isWritePending || isSwitchingChain
                          ? "Funding payroll"
                          : "Fund payroll codes"}
                  </button>
                </div>

                {payrollExplorerUrl ? (
                  <a
                    className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-swift-700 transition hover:text-swift-600"
                    href={payrollExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View payroll escrow on ArcScan
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ) : null}

                <div className="grid gap-3">
                  {activeFolder?.recipients.length ? (
                    activeFolder.recipients.map((recipient) => (
                      <article
                        className="grid gap-3 rounded-lg border border-lavender-100 bg-white/85 px-3 py-3 shadow-sm sm:grid-cols-[1fr_auto]"
                        key={recipient.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">
                            {recipient.name}
                          </p>
                          <p className="truncate text-xs font-semibold text-muted">
                            {shortenAddress(recipient.address)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <span className="inline-flex items-center gap-1.5 text-sm font-black text-ink">
                            <TokenIcon
                              className="h-4 w-4 shrink-0 rounded-full"
                              symbol={recipient.token}
                            />
                            <span>{recipient.amount}</span>
                            <span>{recipient.token}</span>
                          </span>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-lavender-100 bg-white text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => handleRemoveEmployee(recipient.id)}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-lg border border-lavender-100 bg-lavender-50 px-4 py-4 text-sm font-semibold text-muted">
                      Add employees to this folder.
                    </div>
                  )}
                </div>

                {payrollCodes.length > 0 ? (
                  <div className="mt-5 grid gap-3">
                    <p className="text-sm font-black text-swift-700">
                      {payrollStatus}
                    </p>
                    {payrollCodes.map((record) => (
                      <article
                        className="rounded-lg border border-lavender-100 bg-white/85 px-3 py-3 shadow-sm"
                        key={record.id}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-bold text-ink">
                            {record.employeeName}
                          </p>
                          <button
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-lavender-100 bg-white px-2 text-xs font-bold text-ink transition hover:border-swift-600 hover:text-swift-700"
                            onClick={() =>
                              void copyToClipboard(record.code, record.id)
                            }
                            type="button"
                          >
                            {copiedCodeId === record.id ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {copiedCodeId === record.id ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="max-h-20 overflow-y-auto break-all rounded-lg bg-lavender-50 px-3 py-2 font-mono text-xs font-bold leading-5 text-ink">
                          {record.code}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {feature === "claim" ? (
        <section className="surface-panel p-4 sm:p-5">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Claim</p>
              <h2 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink sm:text-3xl">
                Redeem payment code
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                The connected wallet must match the receiver address inside the
                claim code.
              </p>
            </div>
            <div
              className={`inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-bold shadow-sm ${
                claimWalletMatches
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-lavender-200 bg-white/80 text-ink"
              }`}
            >
              <KeyRound className="h-4 w-4" />
              {claimWalletMatches ? "Wallet matched" : "Wallet required"}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-4">
              <textarea
                className="min-h-40 resize-y rounded-lg border border-lavender-200/90 bg-white/80 px-3 py-3 font-mono text-xs font-bold leading-5 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-white focus:ring-2 focus:ring-swift-600/15"
                onChange={(event) => setClaimCode(event.target.value)}
                placeholder="Paste privSwiftPay claim code"
                value={claimCode}
              />

              {claimError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{claimError}</span>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white px-5 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 active:translate-y-0"
                  onClick={handleInspectClaimCode}
                  type="button"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Check code
                </button>
                <button
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-swift-600 px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(66,17,143,0.26)] transition hover:-translate-y-0.5 hover:bg-swift-700 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-lavender-300 disabled:shadow-none"
                  disabled={!claimWalletMatches || !isEscrowConfigured || isTransactionBusy}
                  onClick={handleClaimCode}
                  type="button"
                >
                  {isClaiming || isWritePending || isSwitchingChain ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {!isEscrowConfigured
                    ? "Escrow missing"
                    : isClaiming || isWritePending || isSwitchingChain
                      ? "Claiming"
                      : "Claim funds"}
                </button>
              </div>

              {claimExplorerUrl ? (
                <a
                  className="inline-flex items-center gap-2 text-sm font-bold text-swift-700 transition hover:text-swift-600"
                  href={claimExplorerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  View claim on ArcScan
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <div className="surface-card px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Verification</p>
                  <h3 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink">
                    Claim details
                  </h3>
                </div>
                <ShieldCheck
                  className={`h-5 w-5 ${
                    claimWalletMatches ? "text-emerald-700" : "text-swift-600"
                  }`}
                />
              </div>

              <div className="mt-5 grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Status</span>
                  <span className="text-right font-bold text-swift-700">
                    {claimStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Connected</span>
                  <span className="font-mono text-xs font-bold text-ink">
                    {shortenAddress(address)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Receiver</span>
                  <span className="font-mono text-xs font-bold text-ink">
                    {shortenAddress(claimPayload?.recipient)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Amount</span>
                  <span className="inline-flex items-center justify-end gap-1.5 text-right font-bold text-ink">
                    {claimPayload ? (
                      <>
                        <TokenIcon
                          className="h-4 w-4 shrink-0 rounded-full"
                          symbol={claimPayload.token}
                        />
                        <span>{claimPayload.amount}</span>
                        <span>{claimPayload.token}</span>
                      </>
                    ) : (
                      "No code"
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-muted">Pool</span>
                  <span className="text-right font-bold text-ink">
                    {claimPayload?.pool ?? "Not loaded"}
                  </span>
                </div>
                <div className="grid gap-1 border-t border-lavender-100 pt-3">
                  <span className="font-semibold text-muted">Commitment</span>
                  <span className="break-all font-mono text-xs font-bold text-ink">
                    {claimPayload?.commitment ?? "Waiting for code"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        ) : null}
        </PlatformPageBody>
      </div>
    </main>
  );
}

export function PrivSwiftPayFeaturePage({
  feature,
}: {
  feature: PrivSwiftPayFeature;
}) {
  return (
    <PlatformAccessGate>
      <PrivSwiftPayContent feature={feature} />
    </PlatformAccessGate>
  );
}

export default PrivSwiftPayFeaturePage;
