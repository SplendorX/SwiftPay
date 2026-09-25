import { AppKit, isRetryableError } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { Address } from "viem";

import { isArcMainnet } from "@/lib/network";
import { explorerTxUrl } from "@/lib/onchain-facts";
import { parseUsdc } from "@/lib/onchain-money";

export type DepositSourceChain = {
  appKitChain:
    | "Base_Sepolia"
    | "Ethereum_Sepolia"
    | "Arbitrum_Sepolia"
    | "Optimism_Sepolia"
    | "Avalanche_Fuji"
    | "Polygon_Amoy_Testnet"
    | "Base"
    | "Ethereum"
    | "Arbitrum"
    | "Optimism"
    | "Avalanche"
    | "Polygon";
  chainId: number;
  explorerTx: (hash: string) => string;
  name: string;
  usdcAddress: Address;
};

const TESTNET_SOURCE_CHAINS: readonly DepositSourceChain[] = [
  {
    appKitChain: "Base_Sepolia",
    chainId: 84_532,
    explorerTx: (hash) => `https://sepolia.basescan.org/tx/${hash}`,
    name: "Base Sepolia",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    appKitChain: "Ethereum_Sepolia",
    chainId: 11_155_111,
    explorerTx: (hash) => `https://sepolia.etherscan.io/tx/${hash}`,
    name: "Ethereum Sepolia",
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  {
    appKitChain: "Arbitrum_Sepolia",
    chainId: 421_614,
    explorerTx: (hash) => `https://sepolia.arbiscan.io/tx/${hash}`,
    name: "Arbitrum Sepolia",
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
  {
    appKitChain: "Optimism_Sepolia",
    chainId: 11_155_420,
    explorerTx: (hash) => `https://sepolia-optimism.etherscan.io/tx/${hash}`,
    name: "Optimism Sepolia",
    usdcAddress: "0x5fd84259d66Cd46123540766Be4dF2941bD271c8",
  },
  {
    appKitChain: "Avalanche_Fuji",
    chainId: 43_113,
    explorerTx: (hash) => `https://testnet.snowtrace.io/tx/${hash}`,
    name: "Avalanche Fuji",
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
  {
    appKitChain: "Polygon_Amoy_Testnet",
    chainId: 80_002,
    explorerTx: (hash) => `https://amoy.polygonscan.com/tx/${hash}`,
    name: "Polygon Amoy",
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  },
];

// USDC addresses match Circle's own chain data (@circle-fin/adapter-circle-wallets).
const MAINNET_SOURCE_CHAINS: readonly DepositSourceChain[] = [
  {
    appKitChain: "Base",
    chainId: 8_453,
    explorerTx: (hash) => `https://basescan.org/tx/${hash}`,
    name: "Base",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    appKitChain: "Ethereum",
    chainId: 1,
    explorerTx: (hash) => `https://etherscan.io/tx/${hash}`,
    name: "Ethereum",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    appKitChain: "Arbitrum",
    chainId: 42_161,
    explorerTx: (hash) => `https://arbiscan.io/tx/${hash}`,
    name: "Arbitrum",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    appKitChain: "Optimism",
    chainId: 10,
    explorerTx: (hash) => `https://optimistic.etherscan.io/tx/${hash}`,
    name: "Optimism",
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  {
    appKitChain: "Avalanche",
    chainId: 43_114,
    explorerTx: (hash) => `https://snowtrace.io/tx/${hash}`,
    name: "Avalanche",
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
  {
    appKitChain: "Polygon",
    chainId: 137,
    explorerTx: (hash) => `https://polygonscan.com/tx/${hash}`,
    name: "Polygon",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
];

/** Chains USDC can be bridged from, matching the Arc network this build targets. */
export const DEPOSIT_SOURCE_CHAINS = isArcMainnet()
  ? MAINNET_SOURCE_CHAINS
  : TESTNET_SOURCE_CHAINS;

export function depositSourceByChainId(chainId: number) {
  return DEPOSIT_SOURCE_CHAINS.find((chain) => chain.chainId === chainId);
}

/**
 * The four stages SwiftPay shows while a deposit is in flight.
 *
 * App Kit routes USDC over one of two CCTP providers and they name their steps
 * differently: CCTPv2 emits `approve`/`burn`/`fetchAttestation`/`mint`, CCTPx
 * emits `approve`/`transfer`/`fetchAttestation`/`forward`. Both are normalized
 * onto this list so nothing here depends on which provider served the route.
 */
export const DEPOSIT_STEPS = [
  "approve",
  "burn",
  "attestation",
  "mint",
] as const;

export type DepositStep = (typeof DEPOSIT_STEPS)[number];

export const DEPOSIT_STEP_LABELS: Record<DepositStep, string> = {
  approve: "Approving USDC on the source chain",
  attestation: "Waiting for Circle attestation",
  burn: "Burning USDC on the source chain",
  mint: "Minting USDC on Arc",
};

const sourceStepNames = new Set(["approve", "burn", "transfer"]);

function normalizeStepName(name: string): DepositStep | null {
  switch (name) {
    case "approve":
      return "approve";
    case "burn":
    case "transfer":
      return "burn";
    case "fetchAttestation":
    case "reAttest":
      return "attestation";
    case "mint":
    case "forward":
      return "mint";
    default:
      return null;
  }
}

/** App Kit's identifier for the Arc network this build targets. */
export function arcAppKitChain(): "Arc" | "Arc_Testnet" {
  return isArcMainnet() ? "Arc" : "Arc_Testnet";
}

/** Thrown when the wallet owner declines a signature — not a failure to report. */
export class DepositRejectedError extends Error {
  constructor() {
    super("Deposit cancelled in the wallet.");
    this.name = "DepositRejectedError";
  }
}

function isRejection(value: unknown): boolean {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request") ||
    normalized.includes("4001")
  );
}

/**
 * Map a bridge failure onto copy a depositor can act on.
 *
 * Kept apart from `getSwapErrorMessage`: a bridge never touches the server
 * KIT_KEY or a StableFX pair, so the swap hints would misdirect here.
 */
export function getDepositErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  // Circle's developer-controlled adapter only signs for wallets in the
  // deployment's own wallet set. SwiftPay provisions user-controlled (ENDUSER)
  // wallets, so a server-signed top up cannot sign for them — say that plainly
  // rather than surfacing a raw RPC dump.
  if (
    normalized.includes("cannot find target wallet") ||
    normalized.includes("not accessible to the caller")
  ) {
    return "This wallet is not one SwiftPay can sign for on that chain. Server-signed top ups need a developer-controlled Circle wallet that holds USDC on the source chain — connect a self-custody wallet and bridge from there instead.";
  }

  if (
    normalized.includes("insufficient funds") ||
    normalized.includes("exceeds balance") ||
    normalized.includes("transfer amount exceeds")
  ) {
    return "Not enough USDC or native gas on the source chain to cover this deposit.";
  }

  if (
    normalized.includes("chain not configured") ||
    normalized.includes("unsupported chain") ||
    normalized.includes("unsupported route")
  ) {
    return "SwiftPay cannot bridge from that network. Pick another source chain.";
  }

  if (
    normalized.includes("no route available") ||
    normalized.includes("route or resource not found")
  ) {
    return "Circle has no CCTP route open for this pair right now. Try again shortly or pick another source chain.";
  }

  if (
    normalized.includes("polling timeout") ||
    normalized.includes("timed out")
  ) {
    return "The burn went through but Circle is still attesting it. The USDC will arrive on Arc without further action.";
  }

  return message;
}

type BridgeStep = {
  errorCategory?: string;
  errorMessage?: string;
  explorerUrl?: string;
  name?: string;
  state?: string;
  txHash?: string;
};

type BridgeResult = {
  state?: string;
  steps?: BridgeStep[];
};

/**
 * A bridge that stopped partway, carrying the result App Kit needs to pick it
 * back up. Resuming matters: the burn may already be on chain, so starting a
 * fresh bridge would burn a second time.
 */
export class DepositIncompleteError extends Error {
  readonly canResume: boolean;
  readonly result: unknown;

  constructor(message: string, result: unknown, canResume: boolean) {
    super(message);
    this.name = "DepositIncompleteError";
    this.canResume = canResume;
    this.result = result;
  }
}

function firstFailedStep(result: BridgeResult) {
  return result.steps?.find((step) => step.state === "error");
}

/** True when App Kit says the failure is worth resuming rather than redoing. */
function canResumeBridge(result: BridgeResult) {
  const failed = firstFailedStep(result) as
    | (BridgeStep & { error?: unknown })
    | undefined;

  if (!failed) {
    return false;
  }

  if (failed.errorCategory === "user_rejected") {
    return false;
  }

  try {
    return failed.error !== undefined ? isRetryableError(failed.error) : true;
  } catch {
    return true;
  }
}

export type DepositToArcResult = {
  amount: string;
  /** Explorer link for `txHash`, on whichever chain that transaction was mined. */
  explorerUrl: string;
  /** True while Circle still has the mint on Arc to deliver. */
  pending: boolean;
  recipientAddress: Address;
  sourceChain: string;
  txHash: string;
};

/**
 * Pick the transaction worth linking to, paired with the right explorer.
 *
 * The destination mint wins, and only that hash may point at ArcScan: a burn
 * hash belongs to the source chain and renders as a dead link on Arc.
 */
function readTx(result: BridgeResult, source: DepositSourceChain) {
  const steps = (result.steps ?? []).filter((step) => step.txHash);
  const minted = steps.find(
    (step) => normalizeStepName(step.name ?? "") === "mint",
  );
  if (minted?.txHash) {
    return {
      explorerUrl: minted.explorerUrl || explorerTxUrl(minted.txHash),
      pending: false,
      txHash: minted.txHash,
    };
  }

  const onSource = [...steps]
    .reverse()
    .find((step) => sourceStepNames.has(step.name ?? ""));
  if (!onSource?.txHash) {
    return { explorerUrl: "", pending: true, txHash: "" };
  }

  return {
    explorerUrl: onSource.explorerUrl || source.explorerTx(onSource.txHash),
    pending: true,
    txHash: onSource.txHash,
  };
}

export async function bridgeUsdcToArc(input: {
  amount: string;
  onStep?: (step: DepositStep) => void;
  provider: unknown;
  /**
   * Where the minted USDC lands on Arc. Required on purpose: a deposit that
   * quietly defaults to the signing wallet can strand funds outside the
   * SwiftPay balance the depositor was looking at.
   */
  recipientAddress: Address;
  /**
   * A result from a bridge that stopped partway. When set, App Kit resumes
   * that transfer from its last good step instead of burning again.
   */
  resumeFrom?: unknown;
  source: DepositSourceChain;
}): Promise<DepositToArcResult> {
  parseUsdc(input.amount);

  const adapter = await createViemAdapterFromProvider({
    provider: input.provider as Parameters<
      typeof createViemAdapterFromProvider
    >[0]["provider"],
  });

  // A fresh kit per deposit. App Kit appends handlers without deduping and
  // never clears them, so a shared instance replays older deposits' progress.
  const kit = new AppKit();
  const onAction = (payload: unknown) => {
    const onStep = input.onStep;
    if (!onStep) return;
    const method = (payload as { method?: unknown } | null)?.method;
    if (typeof method !== "string") return;
    const step = normalizeStepName(method);
    if (step) onStep(step);
  };
  kit.on("*", onAction);

  let result: BridgeResult;
  try {
    result = (
      input.resumeFrom
        ? await kit.retryBridge(
            input.resumeFrom as Parameters<typeof kit.retryBridge>[0],
            { from: adapter },
          )
        : await kit.bridge({
            amount: input.amount,
            from: { adapter, chain: input.source.appKitChain },
            to: {
              adapter,
              chain: arcAppKitChain(),
              recipientAddress: input.recipientAddress,
              useForwarder: true,
            },
          })
    ) as BridgeResult;
  } catch (cause) {
    throw isRejection(cause) ? new DepositRejectedError() : cause;
  } finally {
    kit.off("*", onAction);
  }

  if (result.state === "error") {
    const failed = firstFailedStep(result);
    if (
      failed?.errorCategory === "user_rejected" ||
      isRejection(failed?.errorMessage)
    ) {
      throw new DepositRejectedError();
    }
    const stage = normalizeStepName(failed?.name ?? "");
    throw new DepositIncompleteError(
      getDepositErrorMessage(
        failed?.errorMessage ||
          (stage
            ? `Deposit failed while ${DEPOSIT_STEP_LABELS[stage].toLowerCase()}.`
            : "Deposit to Arc failed."),
      ),
      result,
      canResumeBridge(result),
    );
  }

  const { explorerUrl, pending, txHash } = readTx(result, input.source);
  if (!txHash) {
    throw new Error("Deposit submitted without a transaction hash.");
  }

  return {
    amount: input.amount,
    explorerUrl,
    pending: pending || result.state !== "success",
    recipientAddress: input.recipientAddress,
    sourceChain: input.source.name,
    txHash,
  };
}
