"use client";

import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
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
  X,
} from "lucide-react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  useAccount,
  useChainId,
  usePublicClient,
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
  maxUint256,
  parseUnits,
  type Address,
  type Hash,
} from "viem";

import { TokenSelect } from "@/components/design/token-select";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ReceiveShareCard } from "@/components/dashboard/receive-share-card";
import { SendPaymentWizard } from "@/components/dashboard/send-payment-wizard";
import { DashboardEarnSummary } from "@/components/earn/dashboard-earn-summary";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { CircleFaucetLink } from "@/components/circle-faucet-link";
import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { ProfileMenu, type WalletMode } from "@/components/profile-menu";
import { TokenIcon } from "@/components/token-icon";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { type BeneficiaryRecord } from "@/lib/beneficiaries";
import {
  completePaymentRequest,
  fetchPaymentRequestStatus,
  paymentRequestClosedMessage,
} from "@/lib/payment-request-client";
import { buildPaymentRequestUrl } from "@/lib/payment-request-url";
import {
  ensureProfile,
  fetchProfile,
  formatUsernameLabel,
  type ProfileRecord,
} from "@/lib/profile";
import { useResolvedRecipient } from "@/lib/use-resolved-recipient";
import {
  fetchWalletSessionForAddress,
  signInWalletSession,
} from "@/lib/wallet-auth-client";
import {
  getArcScanHistoryUrls,
  normalizeArcScanTokenTransfers,
  type ArcScanTokenTransferResponse,
  type WalletTransfer,
} from "@/lib/arcscan-history";
import { erc20Abi } from "@/lib/contracts";
import {
  feePercentLabel,
  platformFeeRecipient,
  platformFeeUnits,
  SEND_FEE_BPS,
} from "@/lib/fees";
import { executeBundledSend } from "@/lib/payments/execute-send";
import {
  callCircleWalletApi,
  findCircleTokenBalance,
  getCircleLoginIdentity,
  readCircleLogin,
  readCircleWallets,
  type CircleClientErrorPayload,
  type CircleLoginResult,
  type CircleTokenBalance,
  type CircleWallet,
  writeCircleWallets,
} from "@/lib/circle-session";
import {
  extractCircleTransactionId,
  extractCircleTxHash,
  recoverCircleTxHash,
} from "@/lib/circle-tx";
import {
  arcTestnetTokens,
  arcTokenSymbols,
  type ArcTokenSymbol,
} from "@/lib/tokens";
import { quotePayment, type PaymentQuote } from "@/lib/save/client";
import { isSwiftSaveVaultConfigured } from "@/lib/save/config";
import {
  recordBundledSpendSave,
  settleSpendSaveAfterPayment,
} from "@/lib/save/spend-save-browser";
import { getSwapErrorMessage } from "@/lib/swap-errors";
import { trackTractionEvent } from "@/lib/traction/client";
import { arcTestnet } from "@/lib/wagmi";
import type { CircleSwapEstimate } from "@/swap/browser";

const fallbackAddress = "0x0000000000000000000000000000000000000000";
const sampleAddress = "0xA71CE15C5A0F4B9d7217B8A7A2E6d9D3F55A9cE1";
const zeroAmount = BigInt(0);

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

type PortfolioChartPoint = {
  dateKey: string;
  delta: number;
  label: string;
  value: number;
};

function formatUsdValue(value: number | undefined | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatSignedUsdValue(value: number | undefined | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "—";
  }

  if (value === 0) {
    return formatUsdValue(0);
  }

  return `${value > 0 ? "+" : "-"}${formatUsdValue(Math.abs(value))}`;
}

function formatPortfolioDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  if (!Number.isFinite(date.getTime())) {
    return "Indexed";
  }

  if (dateKey === new Date().toISOString().slice(0, 10)) {
    return "Today";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function shiftPortfolioDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDashboardGreetingName(username: string) {
  const normalized = username.trim().replace(/^@+/, "");
  const compact = normalized.replace(/[_-]+/g, " ");

  return compact
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getTransferDateKey(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function getStablecoinUsdValue(amount: bigint | undefined, decimals: number) {
  if (amount === undefined) {
    return undefined;
  }

  const value = Number(formatUnits(amount, decimals));
  return Number.isFinite(value) ? value : undefined;
}

function getTransferUsdDelta(transfer: WalletTransfer) {
  const amount = Number(transfer.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return transfer.direction === "in" ? amount : -amount;
}

function buildPortfolioChartPoints(input: {
  currentValue: number | undefined;
  transfers: WalletTransfer[];
}): PortfolioChartPoint[] {
  if (
    input.currentValue === undefined ||
    !Number.isFinite(input.currentValue)
  ) {
    return [];
  }

  const currentValue = Math.max(0, input.currentValue);
  const dailyDeltas = new Map<string, number>();

  for (const transfer of input.transfers) {
    const dateKey = getTransferDateKey(transfer.timestamp);
    const delta = getTransferUsdDelta(transfer);

    if (!dateKey || delta === 0) {
      continue;
    }

    dailyDeltas.set(dateKey, (dailyDeltas.get(dateKey) ?? 0) + delta);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const dates = [...dailyDeltas.keys()].sort();

  if (dates.length === 0) {
    const startKey = shiftPortfolioDateKey(todayKey, -6);

    return [
      {
        dateKey: startKey,
        delta: 0,
        label: formatPortfolioDateLabel(startKey),
        value: currentValue,
      },
      {
        dateKey: todayKey,
        delta: 0,
        label: "Today",
        value: currentValue,
      },
    ];
  }

  const indexedDelta = [...dailyDeltas.values()].reduce(
    (total, delta) => total + delta,
    0,
  );
  let runningValue = currentValue - indexedDelta;
  const firstDateKey = dates[0] ?? todayKey;
  const points: PortfolioChartPoint[] = [
    {
      dateKey: shiftPortfolioDateKey(firstDateKey, -1),
      delta: 0,
      label: formatPortfolioDateLabel(shiftPortfolioDateKey(firstDateKey, -1)),
      value: Math.max(0, runningValue),
    },
  ];

  for (const dateKey of dates) {
    const delta = dailyDeltas.get(dateKey) ?? 0;
    runningValue += delta;
    points.push({
      dateKey,
      delta,
      label: formatPortfolioDateLabel(dateKey),
      value: Math.max(0, runningValue),
    });
  }

  const latestPoint = points[points.length - 1];

  if (latestPoint?.dateKey === todayKey) {
    points[points.length - 1] = {
      ...latestPoint,
      label: "Today",
      value: currentValue,
    };
  } else if (latestPoint) {
    points.push({
      dateKey: todayKey,
      delta: currentValue - latestPoint.value,
      label: "Today",
      value: currentValue,
    });
  }

  return points.slice(-12);
}

function toChartNumber(value: number) {
  return Number(value.toFixed(2));
}

function buildSmoothChartPath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  const firstPoint = points[0];
  let path = `M ${toChartNumber(firstPoint.x)} ${toChartNumber(firstPoint.y)}`;

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1] ?? firstPoint;
    const point = points[index] ?? previousPoint;
    const midX = (previousPoint.x + point.x) / 2;
    path += ` C ${toChartNumber(midX)} ${toChartNumber(previousPoint.y)}, ${toChartNumber(midX)} ${toChartNumber(point.y)}, ${toChartNumber(point.x)} ${toChartNumber(point.y)}`;
  }

  return path;
}

function PortfolioValueBoard({
  addressLabel,
  changeLabel,
  currentValue,
  historyLabel,
  isConnected,
  isLoading,
  points,
}: {
  addressLabel: string;
  changeLabel: string;
  currentValue: number | undefined;
  historyLabel: string;
  isConnected: boolean;
  isLoading: boolean;
  points: PortfolioChartPoint[];
}) {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const chartPoints =
    points.length >= 2
      ? points
      : [
          { dateKey: "start", delta: 0, label: "Start", value: 0 },
          { dateKey: "today", delta: 0, label: "Today", value: 0 },
        ];
  const latestPoint = points[points.length - 1];
  const values = chartPoints.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const isFlatSeries = maxValue === minValue;
  const range = maxValue - minValue || 1;
  const width = 640;
  const height = 190;
  const paddingX = 10;
  const paddingTop = 18;
  const paddingBottom = 28;
  const chartHeight = height - paddingTop - paddingBottom;
  const coordinates = chartPoints.map((point, index) => {
    const x =
      paddingX +
      (index / Math.max(chartPoints.length - 1, 1)) * (width - paddingX * 2);
    const y = isFlatSeries
      ? paddingTop + chartHeight * 0.48
      : paddingTop + ((maxValue - point.value) / range) * chartHeight;

    return { x, y };
  });
  const linePath = buildSmoothChartPath(coordinates);
  const firstCoordinate = coordinates[0];
  const lastCoordinate = coordinates[coordinates.length - 1];
  const activeIndex = Math.min(
    activePointIndex ?? Math.max(coordinates.length - 1, 0),
    Math.max(coordinates.length - 1, 0),
  );
  const activeCoordinate = coordinates[activeIndex];
  const activePoint = chartPoints[activeIndex];
  const activeTooltipLeft = activeCoordinate
    ? `${Math.min(92, Math.max(8, (activeCoordinate.x / width) * 100))}%`
    : "50%";
  const areaPath =
    linePath && firstCoordinate && lastCoordinate
      ? `${linePath} L ${toChartNumber(lastCoordinate.x)} ${height - paddingBottom} L ${toChartNumber(firstCoordinate.x)} ${height - paddingBottom} Z`
      : "";
  const valueLabel = !isConnected
    ? "Connect wallet"
    : isLoading
      ? "Loading"
      : formatUsdValue(currentValue);

  function handleChartPointerMove(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.min(
      Math.max(event.clientX - bounds.left, 0),
      bounds.width,
    );
    const chartX = (relativeX / Math.max(bounds.width, 1)) * width;
    const nearestIndex = coordinates.reduce((nearest, coordinate, index) => {
      const nearestCoordinate = coordinates[nearest] ?? coordinate;
      return Math.abs(coordinate.x - chartX) <
        Math.abs(nearestCoordinate.x - chartX)
        ? index
        : nearest;
    }, 0);

    setActivePointIndex(nearestIndex);
  }

  return (
    <article className="portfolio-value-board relative overflow-hidden border border-border bg-[linear-gradient(115deg,#f7f3ff_0%,#eff9fb_58%,#d9f8fb_100%)] p-4 shadow-sm dark:bg-[linear-gradient(115deg,rgba(20,18,32,0.95)_0%,rgba(13,31,36,0.95)_58%,rgba(10,47,52,0.95)_100%)] sm:p-5">
      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-cyan-600" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Portfolio value
            </p>
          </div>
          <p className="mt-2 font-heading text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
            {valueLabel}
          </p>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {isConnected ? `Live USD · ${addressLabel}` : "Connect wallet to load live USD"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="soft-pill soft-pill-live">Arc Testnet live</span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
              changeLabel.startsWith("+")
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                : changeLabel.startsWith("-")
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  : "border-border bg-background/70 text-muted-foreground"
            }`}
          >
            {changeLabel}
          </span>
        </div>
      </div>

      <div
        className="relative z-10 mt-5 h-52 cursor-crosshair touch-none sm:h-56"
        onPointerLeave={() => setActivePointIndex(null)}
        onPointerMove={handleChartPointerMove}
      >
        <svg
          aria-label={historyLabel}
          className="h-full w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id="portfolioAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#00d3dc" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#00d3dc" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {activeCoordinate ? (
            <line
              stroke="rgba(15,23,42,0.24)"
              strokeDasharray="4 5"
              strokeWidth="1.4"
              x1={toChartNumber(activeCoordinate.x)}
              x2={toChartNumber(activeCoordinate.x)}
              y1={paddingTop}
              y2={height - paddingBottom}
            />
          ) : null}
          {areaPath ? <path d={areaPath} fill="url(#portfolioAreaGradient)" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="#00d3dc"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          ) : null}
          {activeCoordinate ? (
            <circle
              cx={toChartNumber(activeCoordinate.x)}
              cy={toChartNumber(activeCoordinate.y)}
              fill="#00d3dc"
              r="6"
              stroke="white"
              strokeWidth="2.5"
            />
          ) : null}
        </svg>

        <div
          className="pointer-events-none absolute bottom-12 hidden -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs shadow-xl sm:block"
          style={{ left: activeTooltipLeft }}
        >
          <p className="font-bold text-slate-400">
            {activePoint?.label ?? latestPoint?.label ?? "Today"}
          </p>
          <p className="mt-1 font-black text-cyan-300">
            Value: {activePoint ? formatUsdValue(activePoint.value) : "—"}
          </p>
          <p className="mt-1 font-semibold text-slate-400">
            Change: {activePoint ? formatSignedUsdValue(activePoint.delta) : "—"}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between text-xs font-bold text-muted-foreground">
          <span>{chartPoints[0]?.label ?? "Start"}</span>
          <span>{historyLabel}</span>
          <span>{latestPoint?.label ?? "Today"}</span>
        </div>
      </div>
    </article>
  );
}

type ActivityDropdownOption<T extends string> = {
  label: string;
  value: T;
};

function ActivityFilterDropdown<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: ActivityDropdownOption<T>[];
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div
        className="relative min-w-40"
        onBlur={(event) => {
          const nextTarget = event.relatedTarget as Node | null;

          if (!event.currentTarget.contains(nextTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 text-left text-sm font-semibold text-ink shadow-sm transition hover:border-swift-600/40 focus:outline-none focus:ring-2 focus:ring-swift-600/15"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span>{selected?.label ?? "All"}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {open ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-lg border border-border bg-card shadow-[0_18px_40px_-22px_rgba(15,23,42,0.28)]"
            role="listbox"
          >
            {options.map((option) => (
              <button
                aria-selected={option.value === value}
                className={`flex w-full items-center px-4 py-3 text-left text-sm font-semibold transition hover:bg-swift-600/10 hover:text-swift-700 focus:bg-swift-600/10 focus:text-swift-700 focus:outline-none ${
                  option.value === value
                    ? "bg-swift-600/10 text-swift-700"
                    : "text-ink"
                }`}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
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

export function DashboardContent({
  preview = false,
}: {
  preview?: boolean;
} = {}) {
  const searchParams = useSearchParams();
  const dashboardPrefillQuery = searchParams.toString();
  const incomingRequestId =
    new URLSearchParams(dashboardPrefillQuery).get("requestId")?.trim() || "";
  const circleSdkRef = useRef<W3SSdk | null>(null);
  const {
    address: accountAddress,
    connector,
    isConnected: isAccountConnected,
  } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { signMessageAsync, isPending: isSigningIn } = useSignMessage();
  const [isMounted, setIsMounted] = useState(false);
  const [activeAction, setActiveAction] = useState<"send" | "swap">("send");
  const [copied, setCopied] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ArcTokenSymbol>("USDC");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNarration, setPaymentNarration] = useState("");
  const [transactionHash, setTransactionHash] = useState<Hash>();
  const [transactionLabel, setTransactionLabel] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("Ready");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentQuote, setPaymentQuote] = useState<PaymentQuote | null>(null);
  const [spendSaveNotice, setSpendSaveNotice] = useState<string | null>(null);
  const spendSaveHandledTx = useRef<string | null>(null);
  /** Snapshot of payment details at submit time so Spend&Save still runs after receipt. */
  const pendingSpendSavePayment = useRef<{
    amount: string;
    currency: ArcTokenSymbol;
    ownerWallet: string;
    bundled: boolean;
  } | null>(null);

  const [receiveAmount, setReceiveAmount] = useState("");
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
  const [circleSendSettled, setCircleSendSettled] = useState(false);
  const [swapTokenIn, setSwapTokenIn] = useState<ArcTokenSymbol>("USDC");
  const [swapTokenOut, setSwapTokenOut] = useState<ArcTokenSymbol>("EURC");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapEstimate, setSwapEstimate] = useState<CircleSwapEstimate>();
  const [swapExplorerUrl, setSwapExplorerUrl] = useState<string>();
  const [swapStatus, setSwapStatus] = useState("Ready");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [isSwapEstimating, setIsSwapEstimating] = useState(false);
  const [isSwapPending, setIsSwapPending] = useState(false);
  const [walletTransfers, setWalletTransfers] = useState<WalletTransfer[]>([]);
  const [activityTypeFilter, setActivityTypeFilter] = useState<
    "all" | "in" | "out"
  >("all");
  const [activityTokenFilter, setActivityTokenFilter] = useState<
    "all" | ArcTokenSymbol
  >("all");
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
  const [walletProfile, setWalletProfile] = useState<ProfileRecord | null>(null);
  const [incomingRequestStatus, setIncomingRequestStatus] = useState<
    "pending" | "paid" | "declined" | "expired" | "unknown" | null
  >(null);

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
  const isExternalWalletMode =
    walletMode === "external" ||
    (!isEmbeddedWalletMode && Boolean(externalAddress));
  // Prefer active Circle wallet when in circle mode; otherwise use external.
  // Fall back so a connected MetaMask is not ignored while walletMode is still "circle".
  const address = isEmbeddedWalletMode
    ? circleAddress
    : externalAddress ?? (isCircleWalletConnected ? circleAddress : undefined);
  const isConnected = Boolean(address);
  const walletAddress = address ?? sampleAddress;
  const fallbackAddressTyped = fallbackAddress as Address;
  const isArcNetwork =
    isEmbeddedWalletMode || (isExternalWalletMode && chainId === arcTestnet.id);
  const selectedTokenInfo = arcTestnetTokens[selectedToken];
  const trimmedRecipientInput = recipientAddress.trim();
  const {
    displayLabel: recipientDisplayLabel,
    error: recipientResolveError,
    isResolving: isRecipientResolving,
    isValid: isRecipientValid,
    resolvedAddress: resolvedRecipientAddress,
    resolvedUsername: resolvedRecipientUsername,
  } = useResolvedRecipient(recipientAddress);
  const trimmedRecipientAddress = resolvedRecipientAddress ?? trimmedRecipientInput;
  const trimmedPaymentNarration = paymentNarration.trim();
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

  const portfolioValue = useMemo(() => {
    if (!isConnected) {
      return undefined;
    }

    const usdcValue = getStablecoinUsdValue(
      tokenBalances.USDC,
      arcTestnetTokens.USDC.decimals,
    );
    const eurcValue = getStablecoinUsdValue(
      tokenBalances.EURC,
      arcTestnetTokens.EURC.decimals,
    );

    if (usdcValue === undefined || eurcValue === undefined) {
      return undefined;
    }

    return usdcValue + eurcValue;
  }, [isConnected, tokenBalances.EURC, tokenBalances.USDC]);
  const portfolioChartPoints = useMemo(
    () =>
      buildPortfolioChartPoints({
        currentValue: portfolioValue,
        transfers: walletTransfers,
      }),
    [portfolioValue, walletTransfers],
  );
  const previousPortfolioPoint =
    portfolioChartPoints.length > 1
      ? portfolioChartPoints[portfolioChartPoints.length - 2]
      : undefined;
  const portfolioChangeValue =
    portfolioValue !== undefined && previousPortfolioPoint
      ? portfolioValue - previousPortfolioPoint.value
      : undefined;
  const portfolioChangeLabel =
    portfolioChangeValue === undefined
      ? "Indexed by ArcScan"
      : `${formatSignedUsdValue(portfolioChangeValue)} since ${previousPortfolioPoint?.label ?? "last point"}`;
  const portfolioHistoryLabel =
    walletTransfers.some((transfer) => getTransferDateKey(transfer.timestamp))
      ? "Indexed daily shifts"
      : "No indexed changes";
  const isPortfolioLoading = Boolean(isConnected && portfolioValue === undefined);

  const selectedTokenBalance = tokenBalances[selectedToken];

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

  const spendSaveUnits = useMemo(() => {
    if (!paymentQuote?.spendSave.active || !paymentQuote.spendSave.saveAmountUnits) {
      return zeroAmount;
    }
    try {
      return BigInt(paymentQuote.spendSave.saveAmountUnits);
    } catch {
      return zeroAmount;
    }
  }, [paymentQuote]);

  const sendFeeUnits = useMemo(() => {
    if (paymentQuote?.platformFeeUnits) {
      try {
        return BigInt(paymentQuote.platformFeeUnits);
      } catch {
        return zeroAmount;
      }
    }
    if (paymentAmountUnits === null) {
      return zeroAmount;
    }
    return platformFeeUnits(paymentAmountUnits, SEND_FEE_BPS);
  }, [paymentAmountUnits, paymentQuote]);

  const totalPaymentRequiredUnits = useMemo(() => {
    if (paymentAmountUnits === null) return null;
    return paymentAmountUnits + sendFeeUnits + spendSaveUnits;
  }, [paymentAmountUnits, sendFeeUnits, spendSaveUnits]);

  const hasEnoughTokenBalance = Boolean(
    paymentAmountUnits !== null &&
      paymentAmountUnits > zeroAmount &&
      totalPaymentRequiredUnits !== null &&
      selectedTokenBalance !== undefined &&
      selectedTokenBalance >= totalPaymentRequiredUnits,
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
  const incomingRequestClosedMessage = incomingRequestStatus
    ? paymentRequestClosedMessage(incomingRequestStatus)
    : null;
  const isIncomingRequestClosed = Boolean(incomingRequestClosedMessage);
  const canSubmitPayment = Boolean(
    isConnected &&
      isArcNetwork &&
      isRecipientValid &&
      paymentAmountUnits !== null &&
      paymentAmountUnits > zeroAmount &&
      hasEnoughTokenBalance &&
      !isCirclePaymentPending &&
      !isWritePending &&
      !isConfirming &&
      !isIncomingRequestClosed,
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
  const primaryButtonText = incomingRequestStatus === "declined"
    ? "Request declined"
    : incomingRequestStatus === "paid"
      ? "Request already paid"
    : incomingRequestStatus === "expired"
      ? "Request expired"
    : !isConnected
    ? "Connect wallet"
    : !isArcNetwork
      ? "Switch to Arc Testnet"
      : isRecipientResolving
        ? "Resolving recipient"
        : !isRecipientValid
          ? "Enter recipient"
        : paymentAmountUnits === null || paymentAmountUnits <= zeroAmount
          ? "Enter amount"
          : selectedTokenBalance === undefined
            ? "Loading balance"
            : !hasEnoughTokenBalance
              ? paymentQuote
                ? `Need ${paymentQuote.totalRequired} ${selectedToken}`
                : `Insufficient ${selectedToken}`
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

    return buildPaymentRequestUrl({
      amount: receiveAmount,
      chainId: arcTestnet.id,
      origin: window.location.origin,
      path: "/pay",
      token: receiveToken,
      username: walletProfile?.username,
      walletAddress,
    });
  }, [
    isMounted,
    receiveAmount,
    receiveToken,
    walletAddress,
    walletProfile?.username,
  ]);
  const paymentNarrationSteps = useMemo(
    () => [
      isRecipientResolving
        ? "Resolving recipient username"
        : isRecipientValid
          ? resolvedRecipientUsername
            ? `Recipient ${formatUsernameLabel(resolvedRecipientUsername)} is ready`
            : `Recipient ${shortenAddress(trimmedRecipientAddress)} is ready`
          : recipientResolveError
            ? recipientResolveError
            : "Add a recipient wallet address or @username",
      paymentAmountUnits !== null && paymentAmountUnits > zeroAmount
        ? `${formatDisplayAmount(paymentAmount)} ${selectedToken} prepared`
        : "Enter the payment amount",
      sendFeeUnits > zeroAmount
        ? `Platform fee ${feePercentLabel(SEND_FEE_BPS)}: ${formatDisplayAmount(formatUnits(sendFeeUnits, selectedTokenInfo.decimals))} ${selectedToken}`
        : `Platform fee ${feePercentLabel(SEND_FEE_BPS)} applies on send`,
      paymentQuote?.spendSave.active
        ? `Spend&Save ${paymentQuote.spendSave.percentage}% → ${paymentQuote.spendSave.pocketName ?? "pocket"} (${paymentQuote.spendSave.saveAmount} ${selectedToken}) included in the same transaction`
        : "Spend&Save is off for this payment",
      trimmedPaymentNarration
        ? `Receipt note: ${trimmedPaymentNarration}`
        : "Add a receipt note if needed",
    ],
    [
      isRecipientResolving,
      isRecipientValid,
      paymentAmount,
      paymentAmountUnits,
      paymentQuote,
      recipientResolveError,
      resolvedRecipientUsername,
      selectedToken,
      selectedTokenInfo.decimals,
      sendFeeUnits,
      trimmedPaymentNarration,
      trimmedRecipientAddress,
    ],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!address) {
      return;
    }

    trackTractionEvent({
      chainId: arcTestnet.id,
      circleSocialUuid:
        getCircleLoginIdentity(circleLogin).socialUserUUID ?? undefined,
      eventType: "dashboard_active",
      metadata: {
        mode: isEmbeddedWalletMode ? "circle" : "external",
      },
      source: "dashboard",
      walletAddress: address,
    });
  }, [address, circleLogin, isEmbeddedWalletMode]);

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
    const params = new URLSearchParams(dashboardPrefillQuery);
    const requestedRecipient = params.get("recipient") ?? params.get("to");
    const requestedUsername = params.get("username");
    const requestedAmount = params.get("amount");
    const requestedToken = params.get("token");
    const requestedMemo = params.get("memo");

    if (requestedUsername) {
      setRecipientAddress(
        requestedUsername.startsWith("@")
          ? requestedUsername
          : `@${requestedUsername}`,
      );
    } else if (requestedRecipient && isAddress(requestedRecipient)) {
      setRecipientAddress(requestedRecipient);
    } else if (requestedRecipient) {
      setRecipientAddress(
        requestedRecipient.startsWith("@")
          ? requestedRecipient
          : `@${requestedRecipient}`,
      );
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
    }
  }, [dashboardPrefillQuery]);

  useEffect(() => {
    if (!incomingRequestId) {
      setIncomingRequestStatus(null);
      return;
    }

    let cancelled = false;
    setIncomingRequestStatus("pending");

    void fetchPaymentRequestStatus(incomingRequestId)
      .then((result) => {
        if (!cancelled) {
          setIncomingRequestStatus(result.status);
          const closed = paymentRequestClosedMessage(result.status);
          if (closed) {
            setPaymentError(closed);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIncomingRequestStatus("unknown");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [incomingRequestId]);

  async function settleIncomingPaymentRequest(txHash?: string | null) {
    if (!incomingRequestId || !address) {
      return;
    }

    try {
      await completePaymentRequest({
        circleSocialUuid:
          getCircleLoginIdentity(circleLogin).socialUserUUID ?? undefined,
        ownerWallet: address,
        requestId: incomingRequestId,
        txHash,
      });
      setIncomingRequestStatus("paid");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "This payment request is no longer open.";
      if (/declined|already paid|no longer open/i.test(message)) {
        setIncomingRequestStatus(
          /declined/i.test(message) ? "declined" : "paid",
        );
        setPaymentError(message);
      }
    }
  }

  useEffect(() => {
    if (!address) {
      setWalletProfile(null);
      return;
    }

    const connectedAddress = address;
    let cancelled = false;

    async function loadWalletProfile() {
      try {
        const profile =
          (await fetchProfile(connectedAddress)) ??
          (await ensureProfile({
            authProvider: isEmbeddedWalletMode ? "google" : "external",
            circleSocialUuid: getCircleLoginIdentity(circleLogin).socialUserUUID,
            walletAddress: connectedAddress,
          }));

        if (!cancelled) {
          setWalletProfile(profile);
        }
      } catch {
        if (!cancelled) {
          setWalletProfile(null);
        }
      }
    }

    void loadWalletProfile();

    return () => {
      cancelled = true;
    };
  }, [address, circleLogin, isEmbeddedWalletMode]);

  useEffect(() => {
    if (!paymentAmountUnits || paymentAmountUnits <= zeroAmount || !address) {
      setPaymentQuote(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const social =
            getCircleLoginIdentity(circleLogin).socialUserUUID ?? undefined;
          const result = await quotePayment({
            ownerWallet: address,
            amount: paymentAmount.trim(),
            currency: selectedToken,
            paymentKind: "outgoing",
            circleSocialUuid: social,
          });
          if (cancelled) return;
          setPaymentQuote(result);
        } catch {
          // Quote can fail without wallet session; still apply the local fee.
          if (!cancelled) setPaymentQuote(null);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, paymentAmount, paymentAmountUnits, selectedToken, circleLogin]);

  /**
   * Always re-check Spend&Save on the server after a confirmed payment.
   * Do not rely only on client quote state (it can be null after submit / Circle).
   */
  async function runSpendSaveAfterConfirmedPayment(paymentTxHash: string) {
    const snapshot = pendingSpendSavePayment.current;
    const ownerWallet = snapshot?.ownerWallet ?? address;
    const amount = snapshot?.amount ?? paymentAmount.trim();
    const currency = snapshot?.currency ?? selectedToken;

    if (!ownerWallet || !amount || !paymentTxHash) {
      return;
    }
    if (spendSaveHandledTx.current === paymentTxHash) {
      return;
    }
    if (!isSwiftSaveVaultConfigured()) {
      setSpendSaveNotice(
        "Spend&Save is on, but the savings vault is not configured on this deployment.",
      );
      return;
    }

    spendSaveHandledTx.current = paymentTxHash;
    const social =
      getCircleLoginIdentity(circleLogin).socialUserUUID ?? undefined;

    try {
      // Server is source of truth for whether Spend&Save is active.
      const liveQuote = await quotePayment({
        ownerWallet,
        amount,
        currency,
        paymentKind: "outgoing",
        circleSocialUuid: social,
      });

      if (!liveQuote.spendSave.active) {
        // Not an error — feature off or ineligible payment.
        return;
      }

      const pocketLabel =
        liveQuote.spendSave.pocketName ?? "your pocket";

      if (snapshot?.bundled) {
        const settled = await recordBundledSpendSave({
          ownerWallet,
          amount,
          currency,
          paymentTxHash,
          circleSocialUuid: social,
        });
        const savedMsg = `${settled.saveAmount} ${currency} saved automatically to ${pocketLabel}.`;
        trackTractionEvent({
          amount: settled.saveAmount,
          chainId: arcTestnet.id,
          circleSocialUuid: social,
          currency,
          eventType: "savings_deposit_completed",
          metadata: {
            bundled: true,
            eventId: settled.eventId,
            pocketName: pocketLabel,
            transactionId: settled.transactionId,
          },
          source: "spend_save",
          txHash: settled.savingsTxHash,
          walletAddress: ownerWallet,
        });
        setSpendSaveNotice(savedMsg);
        setPaymentStatus(`Payment successful. ${savedMsg}`);
        pendingSpendSavePayment.current = null;
        void refreshBalances();
        return;
      }

      setSpendSaveNotice(
        `Spend&Save: saving ${liveQuote.spendSave.saveAmount} ${currency} (${liveQuote.spendSave.percentage}%)…`,
      );
      setPaymentStatus(
        `Payment confirmed. Spend&Save: confirm the savings deposit…`,
      );

      const useCircle =
        isEmbeddedWalletMode &&
        Boolean(circleLogin && circleWallet?.id && circleSdkRef.current);

      const settled = await settleSpendSaveAfterPayment({
        ownerWallet,
        amount,
        currency,
        paymentTxHash,
        circleSocialUuid: social,
        mode: useCircle ? "circle" : "external",
        chainId: arcTestnet.id,
        writeContractAsync: useCircle
          ? undefined
          : async (args) =>
              writeContractAsync({
                address: args.address,
                abi: args.abi,
                functionName: args.functionName as "approve" | "deposit",
                args: args.args as never,
                chainId: args.chainId,
              }),
        circleExecutor:
          useCircle && circleLogin && circleWallet?.id
            ? {
                login: circleLogin,
                walletId: circleWallet.id,
                executeChallenge: async (challengeId) => {
                  const sdk = circleSdkRef.current;
                  if (!sdk) {
                    throw new Error(
                      "Circle wallet confirmation is not ready for Spend&Save.",
                    );
                  }
                  sdk.setAuthentication({
                    encryptionKey: circleLogin.encryptionKey,
                    userToken: circleLogin.userToken,
                  });
                  setPaymentStatus(
                    "Confirm Spend&Save deposit in Circle wallet…",
                  );
                  return new Promise((resolve, reject) => {
                    sdk.execute(challengeId, (error, result) => {
                      if (error) {
                        reject(new Error(getErrorMessage(error)));
                        return;
                      }
                      const challengeResult =
                        result as CircleChallengeResult | undefined;
                      resolve({
                        transactionId:
                          challengeResult?.data?.transactionId ??
                          challengeResult?.transactionId ??
                          challengeResult?.data?.id ??
                          challengeResult?.id,
                        txHash: challengeResult?.data?.txHash,
                      });
                    });
                  });
                },
              }
            : undefined,
      });
      const savedMsg = `$${settled.saveAmount} saved automatically to ${pocketLabel}.`;
      trackTractionEvent({
        amount: settled.saveAmount,
        chainId: arcTestnet.id,
        circleSocialUuid: social,
        currency,
        eventType: "savings_deposit_completed",
        metadata: {
          eventId: settled.eventId,
          mode: useCircle ? "circle" : "external",
          pocketName: pocketLabel,
          transactionId: settled.transactionId,
        },
        source: "spend_save",
        txHash: settled.savingsTxHash,
        walletAddress: ownerWallet,
      });
      setSpendSaveNotice(savedMsg);
      setPaymentStatus(`Payment successful. ${savedMsg}`);
      pendingSpendSavePayment.current = null;
      void refreshBalances();
    } catch (error) {
      // Allow a single retry on a later receipt if settlement failed.
      if (spendSaveHandledTx.current === paymentTxHash) {
        spendSaveHandledTx.current = null;
      }
      const msg = `Payment succeeded. Spend&Save needs attention: ${getErrorMessage(error)}. Your payment wasn’t affected — open Swift+Save to finish saving.`;
      setSpendSaveNotice(msg);
      setPaymentStatus(msg);
    }
  }

  useEffect(() => {
    if (!transactionHash || transactionReceipt || circleSendSettled) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCircleSendSettled(true);
      setPaymentStatus(`${selectedToken} payment submitted`);
    }, 45_000);
    return () => window.clearTimeout(timeoutId);
  }, [circleSendSettled, selectedToken, transactionHash, transactionReceipt]);

  useEffect(() => {
    if (!transactionReceipt) {
      return;
    }

    if (transactionReceipt.status === "success") {
      setPaymentError(null);
      setPaymentStatus(`${transactionLabel} confirmed`);
      void refreshBalances();

      const paymentTx = transactionReceipt.transactionHash;
      if (paymentTx) {
        void runSpendSaveAfterConfirmedPayment(paymentTx);
        void settleIncomingPaymentRequest(paymentTx);
      }

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
        const session = await fetchWalletSessionForAddress(connectedAddress);
        if (controller.signal.aborted) {
          return;
        }

        setAuthWallet(
          session.authenticated && session.ownerWallet
            ? session.ownerWallet
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
      const session = await signInWalletSession({
        connectorName: connector?.name,
        ownerWallet,
        signMessage: (message) => signMessageAsync({ message }),
      });

      setAuthWallet(session.ownerWallet ?? ownerWallet);
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
      setBeneficiaryError(
        recipientResolveError ??
          "Enter a valid beneficiary wallet address or @username.",
      );
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

  async function executePaymentCircleCall(
    callData: `0x${string}`,
    contractAddress: Address,
    refId: string,
  ) {
    if (!circleLogin || !circleWallet?.id || !circleSdkRef.current) {
      throw new Error("Circle wallet confirmation is not ready.");
    }

    setPaymentStatus(
      refId === "send-bundle"
        ? "Confirm payment in Circle wallet"
        : `Confirm ${refId} in Circle wallet`,
    );

    const challenge = await callCircleWalletApi<CircleTransferChallenge>(
      "createContractExecution",
      {
        callData,
        contractAddress,
        feeLevel: "MEDIUM",
        refId: trimmedPaymentNarration.slice(0, 50) || refId,
        userToken: circleLogin.userToken,
        walletId: circleWallet.id,
      },
    );

    if (!challenge.challengeId) {
      throw new Error("Circle did not return a transfer challenge.");
    }

    const executed = await executeCircleChallenge(challenge.challengeId);
    let txHash = executed.txHash;
    if (!txHash) {
      txHash =
        (await recoverCircleTxHash({
          transactionId: executed.transactionId,
          userToken: circleLogin.userToken,
          walletId: circleWallet.id,
        })) ?? undefined;
    }

    return {
      transactionId: executed.transactionId,
      txHash,
    };
  }

  async function handleCirclePaymentAction() {
    if (isIncomingRequestClosed) {
      setPaymentError(
        incomingRequestClosedMessage ??
          "This payment request is no longer open.",
      );
      return;
    }

    if (!circleLogin || !circleWallet?.id || !circleAddress) {
      setPaymentError("Circle wallet is not ready.");
      return;
    }

    if (!circleSdkRef.current) {
      setPaymentError("Circle wallet confirmation is not ready.");
      return;
    }

    if (!isRecipientValid || !resolvedRecipientAddress) {
      setPaymentError(
        recipientResolveError ??
          "Enter a valid recipient wallet address or @username.",
      );
      return;
    }

    if (paymentAmountUnits === null || paymentAmountUnits <= zeroAmount) {
      setPaymentError("Enter a valid amount.");
      return;
    }

    const destinationAddress = getAddress(resolvedRecipientAddress);
    const recipientLabel = resolvedRecipientUsername
      ? formatUsernameLabel(resolvedRecipientUsername)
      : shortenAddress(destinationAddress);
    const feeRecipientValue = (paymentQuote?.feeRecipient ||
      platformFeeRecipient()) as Address;
    const saveActive = Boolean(paymentQuote?.spendSave.active);
    const saveAmountUnits = saveActive
      ? BigInt(paymentQuote?.spendSave.saveAmountUnits ?? "0")
      : 0n;

    try {
      setIsCirclePaymentPending(true);
      setCircleSendSettled(false);
      setPaymentStatus("Preparing Circle wallet transfer");

      pendingSpendSavePayment.current = {
        amount: paymentAmount.trim(),
        bundled: saveActive && saveAmountUnits > 0n,
        currency: selectedToken,
        ownerWallet: circleAddress.toLowerCase(),
      };

      const result = await executeBundledSend({
        chainId: arcTestnet.id,
        circleExecutor: {
          execute: executePaymentCircleCall,
        },
        router: paymentQuote?.sendRouter,
        feeRecipient: feeRecipientValue,
        feeUnits: sendFeeUnits,
        mode: "circle",
        paymentUnits: paymentAmountUnits,
        readAllowance: publicClient
          ? async (spender) =>
              publicClient.readContract({
                abi: erc20Abi,
                address: selectedTokenInfo.address,
                args: [circleAddress, spender],
                functionName: "allowance",
              })
          : undefined,
        recipient: destinationAddress,
        save:
          saveActive &&
          paymentQuote?.spendSave.pocketIdBytes32 &&
          paymentQuote.vaultAddress
            ? {
                amount: saveAmountUnits,
                pocketId: paymentQuote.spendSave.pocketIdBytes32 as Hash,
                vault: paymentQuote.vaultAddress as Address,
              }
            : undefined,
        token: selectedTokenInfo.address,
      });

      setPaymentError(null);
      setTransactionLabel(
        trimmedPaymentNarration
          ? `${trimmedPaymentNarration} to ${recipientLabel}`
          : `Payment to ${recipientLabel}`,
      );

      if (result.txHash) {
        setTransactionHash(result.txHash);
        setPaymentStatus(`${selectedToken} payment submitted`);
        trackTractionEvent({
          amount: paymentAmount.trim(),
          chainId: arcTestnet.id,
          circleSocialUuid:
            getCircleLoginIdentity(circleLogin).socialUserUUID ?? undefined,
          currency: selectedToken,
          eventType: "payment_submitted",
          metadata: {
            bundledSave: result.bundledSave,
            mode: "circle",
            recipient: destinationAddress,
          },
          source: "dashboard",
          txHash: result.txHash,
          walletAddress: circleAddress,
        });
        void runSpendSaveAfterConfirmedPayment(result.txHash);
        void settleIncomingPaymentRequest(result.txHash);
      } else {
        setCircleSendSettled(true);
        setPaymentStatus(`${selectedToken} payment submitted`);
        void refreshBalances();
      }
    } catch (error) {
      setPaymentError(getErrorMessage(error));
      setPaymentStatus("Circle transfer failed");
      trackTractionEvent({
        amount: paymentAmount.trim(),
        chainId: arcTestnet.id,
        circleSocialUuid:
          getCircleLoginIdentity(circleLogin).socialUserUUID ?? undefined,
        currency: selectedToken,
        eventType: "payment_failed",
        metadata: {
          message: getErrorMessage(error),
          mode: "circle",
        },
        source: "dashboard",
        walletAddress: circleAddress,
      });
      pendingSpendSavePayment.current = null;
    } finally {
      setIsCirclePaymentPending(false);
    }
  }

  async function recoverCirclePaymentTxHash(input: {
    transactionId?: string;
    walletId: string;
    userToken: string;
  }): Promise<string | null> {
    const maxAttempts = 12;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        if (input.transactionId) {
          const tx = await callCircleWalletApi<{
            data?: { txHash?: string; transactionHash?: string };
            txHash?: string;
            transactionHash?: string;
          }>("getTransaction", {
            id: input.transactionId,
            userToken: input.userToken,
          });
          const hash =
            tx.data?.txHash ??
            tx.data?.transactionHash ??
            tx.txHash ??
            tx.transactionHash;
          if (hash && /^0x[a-fA-F0-9]{64}$/.test(hash)) {
            return hash;
          }
        }

        const listed = await callCircleWalletApi<{
          data?: {
            transactions?: Array<{
              txHash?: string;
              transactionHash?: string;
              id?: string;
            }>;
          };
          transactions?: Array<{
            txHash?: string;
            transactionHash?: string;
            id?: string;
          }>;
        }>("listTransactions", {
          userToken: input.userToken,
          walletId: input.walletId,
          pageSize: 5,
        });
        const rows =
          listed.data?.transactions ?? listed.transactions ?? [];
        for (const row of rows) {
          const hash = row.txHash ?? row.transactionHash;
          if (hash && /^0x[a-fA-F0-9]{64}$/.test(hash)) {
            return hash;
          }
        }
      } catch {
        // keep polling
      }
    }
    return null;
  }

    async function handlePaymentAction() {
    setPaymentError(null);
    setCircleSendSettled(false);

    if (isIncomingRequestClosed) {
      setPaymentError(
        incomingRequestClosedMessage ??
          "This payment request is no longer open.",
      );
      return;
    }

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

    if (!isRecipientValid || !resolvedRecipientAddress) {
      setPaymentError(
        recipientResolveError ??
          "Enter a valid recipient wallet address or @username.",
      );
      return;
    }

    if (paymentAmountUnits === null || paymentAmountUnits <= zeroAmount) {
      setPaymentError("Enter a valid amount.");
      return;
    }

    if (!hasEnoughTokenBalance) {
      setPaymentError(
        paymentQuote
          ? `Insufficient ${selectedToken}. This send needs ${paymentQuote.totalRequired} ${selectedToken} (payment + fee${paymentQuote.spendSave.active ? " + Spend&Save" : ""}).`
          : `Insufficient ${selectedToken} balance.`,
      );
      return;
    }

    const destinationAddress = getAddress(resolvedRecipientAddress) as Address;
    const recipientLabel = resolvedRecipientUsername
      ? formatUsernameLabel(resolvedRecipientUsername)
      : shortenAddress(destinationAddress);
    const feeRecipientValue = (paymentQuote?.feeRecipient ||
      platformFeeRecipient()) as Address;
    const saveActive = Boolean(paymentQuote?.spendSave.active);
    const saveAmountUnits = saveActive
      ? BigInt(paymentQuote?.spendSave.saveAmountUnits ?? "0")
      : 0n;

    try {
      pendingSpendSavePayment.current = {
        amount: paymentAmount.trim(),
        bundled: saveActive && saveAmountUnits > 0n,
        currency: selectedToken,
        ownerWallet: address.toLowerCase(),
      };

      const result = await executeBundledSend({
        chainId: arcTestnet.id,
        feeRecipient: feeRecipientValue,
        feeUnits: sendFeeUnits,
        router: paymentQuote?.sendRouter,
        mode: "external",
        paymentUnits: paymentAmountUnits,
        readAllowance: publicClient
          ? async (spender) =>
              publicClient.readContract({
                abi: erc20Abi,
                address: selectedTokenInfo.address,
                args: [address, spender],
                functionName: "allowance",
              })
          : undefined,
        recipient: destinationAddress,
        save:
          saveActive &&
          paymentQuote?.spendSave.pocketIdBytes32 &&
          paymentQuote.vaultAddress
            ? {
                amount: saveAmountUnits,
                pocketId: paymentQuote.spendSave.pocketIdBytes32 as Hash,
                vault: paymentQuote.vaultAddress as Address,
              }
            : undefined,
        token: selectedTokenInfo.address,
        writeContractAsync: async (args) =>
          writeContractAsync({
            address: args.address,
            abi: args.abi,
            functionName: args.functionName as never,
            args: args.args as never,
            chainId: args.chainId,
          }),
      });

      const hash = result.txHash;
      if (hash) {
        setTransactionHash(hash);
      }
      trackTractionEvent({
        amount: paymentAmount.trim(),
        chainId: arcTestnet.id,
        currency: selectedToken,
        eventType: "payment_submitted",
        metadata: {
          mode: "external",
          recipient: destinationAddress,
        },
        source: "dashboard",
        txHash: hash,
        walletAddress: address,
      });
      setTransactionLabel(
        trimmedPaymentNarration
          ? `${trimmedPaymentNarration} to ${recipientLabel}`
          : `Payment to ${recipientLabel}`,
      );
      setPaymentStatus(`${selectedToken} payment submitted`);
    } catch (error) {
      pendingSpendSavePayment.current = null;
      setPaymentError(getErrorMessage(error));
      trackTractionEvent({
        amount: paymentAmount.trim(),
        chainId: arcTestnet.id,
        currency: selectedToken,
        eventType: "payment_failed",
        metadata: {
          message: getErrorMessage(error),
          mode: "external",
        },
        source: "dashboard",
        walletAddress: address,
      });
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

    const executed = await new Promise<{
      transactionId?: string;
      txHash?: string;
    }>((resolve, reject) => {
      sdk.execute(challengeId, (error, result) => {
        if (error) {
          reject(new Error(getErrorMessage(error)));
          return;
        }

        const challengeResult = result as CircleChallengeResult | undefined;
        resolve({
          transactionId: extractCircleTransactionId(challengeResult),
          txHash: extractCircleTxHash(challengeResult),
        });
      });
    });

    if (executed.txHash || !circleWallet?.id) {
      return executed;
    }

    const recovered = await recoverCircleTxHash({
      transactionId: executed.transactionId,
      userToken: circleLogin.userToken,
      walletId: circleWallet.id,
    });

    return {
      transactionId: executed.transactionId,
      txHash: recovered ?? executed.txHash,
    };
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
      trackTractionEvent({
        amount: swapAmount,
        chainId: arcTestnet.id,
        circleSocialUuid:
          activeEmbeddedSwapWallet?.login
            ? getCircleLoginIdentity(activeEmbeddedSwapWallet.login)
                .socialUserUUID ?? undefined
            : undefined,
        currency: swapTokenIn,
        eventType: "swap_submitted",
        metadata: {
          amountOut: result.amountOut,
          mode: activeEmbeddedSwapWallet ? "circle" : "external",
          tokenOut: swapTokenOut,
        },
        source: "dashboard_swap",
        txHash: result.txHash,
        walletAddress:
          activeEmbeddedSwapWallet?.walletAddress ?? address ?? undefined,
      });
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

  const usdcDisplay = isConnected
    ? formatTokenAmount(
        tokenBalances.USDC,
        arcTestnetTokens.USDC.decimals,
        "USDC",
      )
    : "—";
  const eurcDisplay = isConnected
    ? formatTokenAmount(tokenBalances.EURC, arcTestnetTokens.EURC.decimals, "EURC")
    : "—";
  const filteredWalletTransfers = useMemo(
    () =>
      walletTransfers.filter((transfer) => {
        const typeMatches =
          activityTypeFilter === "all" ||
          transfer.direction === activityTypeFilter;
        const tokenMatches =
          activityTokenFilter === "all" ||
          transfer.symbol === activityTokenFilter;

        return typeMatches && tokenMatches;
      }),
    [activityTokenFilter, activityTypeFilter, walletTransfers],
  );
  const dashboardGreetingName = walletProfile?.username
    ? formatDashboardGreetingName(walletProfile.username)
    : null;

  const workspace = (
    <>
        <section className="section-panel" id="balances">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="dashboard-greeting">
                Welcome back
                {dashboardGreetingName ? (
                  <>
                    ,{" "}
                    <span className="dashboard-greeting-name">
                      {dashboardGreetingName}
                    </span>
                  </>
                ) : null}
              </p>
              <h1 className="section-title dashboard-funds-title">Your funds, ready</h1>
              <p className="section-copy">
                Live portfolio, token balances, and settlement activity on Arc Testnet.
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {shortenAddress(walletAddress)}
            </p>
          </div>

          <PortfolioValueBoard
            addressLabel={shortenAddress(walletAddress)}
            changeLabel={portfolioChangeLabel}
            currentValue={portfolioValue}
            historyLabel={portfolioHistoryLabel}
            isConnected={isConnected}
            isLoading={isPortfolioLoading}
            points={portfolioChartPoints}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                      <p className="eyebrow text-[0.68rem]">{symbol} BALANCE</p>
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

                  <div className="field-shell mt-4 flex items-center justify-between gap-3 px-3 py-3 text-sm">
                    <span className="font-semibold text-muted">Status</span>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-muted">
                      {isConnected ? "Loaded" : "Connect"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <DashboardEarnSummary
          availableUsdc={
            typeof rawUsdcBalance === "bigint" ? rawUsdcBalance : undefined
          }
        />

        <QuickActions className="mb-2" />

        <section
          className="grid min-w-0 items-start gap-4 overflow-x-hidden xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
          id="send"
        >
          <div className="glass-panel min-w-0 self-start overflow-x-hidden p-3 sm:p-5">
            <SendPaymentWizard
              address={address}
              authWallet={authWallet}
              beneficiaryError={beneficiaryError}
              beneficiaryName={beneficiaryName}
              beneficiaryStatus={beneficiaryStatus}
              canSaveBeneficiary={canSaveBeneficiary}
              canSubmitPayment={canSubmitPayment}
              isAuthenticatingWallet={isAuthenticatingWallet}
              isBeneficiariesLoading={isBeneficiariesLoading}
              isBeneficiarySaving={isBeneficiarySaving}
              isCirclePaymentPending={isCirclePaymentPending}
              isConfirming={isConfirming}
              isConnected={isConnected}
              isEmbeddedWalletMode={isEmbeddedWalletMode}
              isRecipientResolving={isRecipientResolving}
              isRecipientValid={isRecipientValid}
              recipientDisplayLabel={recipientDisplayLabel}
              recipientResolveError={recipientResolveError}
              resolvedRecipientUsername={resolvedRecipientUsername}
              isSubmitting={
                isWritePending || isConfirming || isCirclePaymentPending
              }
              isSwitchingChain={isSwitchingChain}
              isWalletAuthenticated={isWalletAuthenticated}
              isWritePending={isWritePending}
              onBeneficiaryNameChange={setBeneficiaryName}
              onPaymentAmountChange={setPaymentAmount}
              onPaymentNarrationChange={setPaymentNarration}
              onRecipientChange={setRecipientAddress}
              onSaveBeneficiary={() => void handleSaveBeneficiary()}
              onSelectBeneficiary={(beneficiary) => {
                setBeneficiaryName(beneficiary.name);
                setRecipientAddress(beneficiary.beneficiary_wallet);
                setBeneficiaryError(null);
                setBeneficiaryStatus(null);
              }}
              onSelectToken={setSelectedToken}
              onSubmit={() => void handlePaymentAction()}
              onWalletSignIn={() => void handleWalletSignIn()}
              paymentAmount={paymentAmount}
              paymentAmountUnits={paymentAmountUnits}
              paymentError={paymentError}
              paymentNarration={paymentNarration}
              paymentStatus={paymentStatus}
              spendSaveNotice={spendSaveNotice}
              primaryButtonText={primaryButtonText}
              receiveHref={
                walletProfile?.username
                  ? `/pay?username=${encodeURIComponent(walletProfile.username)}`
                  : `/pay?to=${encodeURIComponent(walletAddress)}`
              }
              recipientAddress={recipientAddress}
              refreshBalances={refreshBalancesFromButton}
              savedBeneficiaries={savedBeneficiaries}
              selectedToken={selectedToken}
              settlementQuote={
                paymentAmountUnits
                  ? {
                      feeAmount:
                        paymentQuote?.platformFeeAmount ??
                        formatUnits(sendFeeUnits, selectedTokenInfo.decimals),
                      feeLabel: `${feePercentLabel(SEND_FEE_BPS)} platform fee`,
                      saveAmount: paymentQuote?.spendSave.active
                        ? paymentQuote.spendSave.saveAmount
                        : undefined,
                      saveLabel: paymentQuote?.spendSave.active
                        ? `Spend&Save ${paymentQuote.spendSave.percentage}% to ${paymentQuote.spendSave.pocketName ?? "your pocket"} is included in this transaction.`
                        : undefined,
                      totalRequired:
                        paymentQuote?.totalRequired ??
                        formatUnits(
                          paymentAmountUnits + sendFeeUnits + spendSaveUnits,
                          selectedTokenInfo.decimals,
                        ),
                    }
                  : null
              }
              shortenAddress={shortenAddress}
              transactionConfirmed={
                transactionReceipt?.status === "success" || circleSendSettled
              }
              transactionExplorerUrl={transactionExplorerUrl}
              trimmedPaymentNarration={trimmedPaymentNarration}
              trimmedRecipientAddress={trimmedRecipientAddress}
              walletAddress={walletAddress}
            />
          </div>

          <div className="grid min-w-0 gap-4">
            <ReceiveShareCard
              isConnected={isConnected}
              username={walletProfile?.username}
              walletAddress={walletAddress}
            />

            <div className="surface-panel min-w-0 overflow-x-hidden p-3 sm:p-5">
              <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">Insights</p>
                  <h2 className="mt-3 font-heading text-lg font-semibold tracking-normal text-ink sm:text-xl">
                    Payment notes
                  </h2>
                </div>
                <button
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-swift-600 to-lavender-500 px-3 text-xs font-black text-white shadow-[0_12px_26px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 active:translate-y-0 sm:h-10 sm:px-4"
                  onClick={refreshBalancesFromButton}
                  type="button"
                >
                  Refresh
                </button>
              </div>

              <p className="text-sm leading-6 text-muted">
                Live narration for the payment currently being prepared.
              </p>

              <div className="mt-5 grid min-w-0 gap-2 rounded-lg border border-dashed border-border bg-muted/60 px-3 py-3 sm:px-4 sm:py-4">
                {paymentNarrationSteps.map((step, index) => (
                  <div
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3"
                    key={step}
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-card text-xs font-black text-primary shadow-sm">
                      {index + 1}
                    </span>
                    <span className="min-w-0 break-words text-sm font-semibold leading-6 text-muted">
                      {step}
                    </span>
                  </div>
                ))}
                <p className="mt-2 text-sm leading-6 text-muted">
                  Recent transfers indexed: {walletTransfers.length}.
                </p>
              </div>
            </div>

          </div>
        </section>

        <section
          className={`surface-panel min-w-0 overflow-x-hidden p-3 sm:p-5${preview ? " hidden" : ""}`}
          id="activity"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Activity</p>
              <h2 className="mt-3 font-heading text-xl font-semibold tracking-normal text-ink sm:text-2xl">
                Wallet transactions
              </h2>
            </div>
            <ReceiptText className="h-5 w-5 shrink-0 text-swift-600" />
          </div>

          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <ActivityFilterDropdown
                label="Type"
                onChange={setActivityTypeFilter}
                options={[
                  { label: "All types", value: "all" },
                  { label: "Send", value: "out" },
                  { label: "Receive", value: "in" },
                ]}
                value={activityTypeFilter}
              />

              <ActivityFilterDropdown
                label="Token"
                onChange={setActivityTokenFilter}
                options={[
                  { label: "All tokens", value: "all" },
                  { label: "USDC", value: "USDC" },
                  { label: "EURC", value: "EURC" },
                ]}
                value={activityTokenFilter}
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted">
              <ReceiptText className="h-4 w-4 shrink-0 text-swift-600" />
              <span>
                {filteredWalletTransfers.length} of {walletTransfers.length}{" "}
                transactions
              </span>
            </div>
          </div>

          <div className="dashboard-activity-list">
            {!isConnected ? (
              <div className="rounded-lg border border-border bg-muted px-4 py-4 text-sm font-semibold text-muted">
                Connect a wallet to load transactions.
              </div>
            ) : isTransfersLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-4 text-sm font-semibold text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading wallet transactions
              </div>
            ) : transfersError ? (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{transfersError}</span>
              </div>
            ) : walletTransfers.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted px-4 py-4 text-sm font-semibold text-muted">
                No recent USDC or EURC transfers found.
              </div>
            ) : filteredWalletTransfers.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted px-4 py-4 text-sm font-semibold text-muted">
                No transactions match these filters.
              </div>
            ) : (
              filteredWalletTransfers.map((transfer) => (
                <article
                  className="grid gap-3 rounded-lg border border-border bg-card px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600/45 hover:shadow-[0_10px_22px_rgba(66,17,143,0.08)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  key={`${transfer.hash}-${transfer.symbol}-${transfer.direction}-${transfer.logIndex}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted">
                        {transfer.direction === "out" ? "Send" : "Receive"}
                      </span>
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-emerald-600">
                        Confirmed
                      </span>
                    </div>
                    <p className="mt-2 truncate text-base font-semibold text-ink">
                      {transfer.direction === "out" ? "-" : "+"}
                      {formatDisplayAmount(transfer.amount)} {transfer.symbol} ·{" "}
                      {transfer.direction === "out" ? "to" : "from"}{" "}
                      {getCounterpartyLabel(transfer)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-muted">
                      {formatTransferTime(transfer.timestamp)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-swift-600 hover:text-swift-700"
                      onClick={() => setReceiptTransfer(transfer)}
                      type="button"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                      Receipt
                    </button>
                    <a
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-muted px-3 text-sm font-bold text-swift-700 transition hover:bg-swift-700 hover:text-white"
                      href={`${arcTestnet.blockExplorers.default.url}/tx/${transfer.hash}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Explorer
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-end">
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
        </section>
    </>
  );

  if (preview) {
    return workspace;
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
            externalWalletAction={<WalletConnectButton />}
            onCircleSessionCleared={handleCircleSessionCleared}
            onWalletModeChange={setWalletMode}
            walletMode={walletMode}
          />
        </>
      }
      subtitle="Financial command center"
      title="Dashboard"
    >
      {workspace}
      {receiptTransfer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-swift-700/40 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-lg">
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-primary/30 hover:bg-primary hover:text-primary-foreground active:translate-y-0"
                onClick={() => setReceiptTransfer(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 ">
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
                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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
                    className="grid gap-1 border-t border-border pt-3 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3"
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary active:translate-y-0"
                onClick={() => void shareReceipt(receiptTransfer)}
                type="button"
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <a
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary active:translate-y-0"
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
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-primary/30 hover:bg-primary hover:text-primary-foreground active:translate-y-0"
                onClick={() => setReceiveOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem]">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-ink">Amount</span>
                <input
                  className="h-11 rounded-lg border border-border/90 bg-background px-3 text-sm font-bold text-ink  outline-none transition placeholder:text-muted focus:border-swift-600 focus:bg-background focus:ring-2 focus:ring-swift-600/15"
                  inputMode="decimal"
                  onChange={(event) => setReceiveAmount(event.target.value)}
                  placeholder="0.00"
                  value={receiveAmount}
                />
              </label>

              <TokenSelect
                label="Asset"
                onChange={setReceiveToken}
                size="sm"
                value={receiveToken}
              />
            </div>

            <div className="mx-auto flex aspect-square w-full max-w-[280px] items-center justify-center rounded-lg border border-border bg-background p-4 ">
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

            <div className="mt-5 rounded-lg border border-border bg-background p-4 ">
              <p className="mb-3 break-all text-xs font-bold leading-5 text-swift-700">
                {paymentRequestUrl || "Payment link will be generated here."}
              </p>
              {walletProfile?.username ? (
                <p className="mb-2 text-sm font-bold text-swift-700">
                  {formatUsernameLabel(walletProfile.username)}
                </p>
              ) : null}
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
    </PlatformChrome>
  );
}

export default function Dashboard() {
  return (
    <PlatformAccessGate>
      <DashboardContent />
    </PlatformAccessGate>
  );
}
