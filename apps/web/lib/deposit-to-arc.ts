import { AppKit, isRetryableError } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { Address } from "viem";

import { MULTICHAIN_CHAINS, type MultichainChain } from "@/lib/multichain/chains";
import { isArcMainnet } from "@/lib/network";
import { explorerTxUrl } from "@/lib/onchain-facts";
import { parseUsdc } from "@/lib/onchain-money";

export type DepositSourceChain = Pick<
  MultichainChain,
  "appKitChain" | "chainId" | "explorerTx" | "name" | "usdcAddress"
>;

/**
 * Chains USDC can be bridged from, matching the Arc network this build
 * targets. The list itself lives in the multichain registry.
 */
export const DEPOSIT_SOURCE_CHAINS: readonly DepositSourceChain[] = MULTICHAIN_CHAINS;

export function depositSourceByChainId(chainId: number) {
  return DEPOSIT_SOURCE_CHAINS.find((chain) => chain.chainId === chainId);
}

/**
 * The four stages SaphraONE shows while a deposit is in flight.
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

export function isRejection(value: unknown): boolean {
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
  // deployment's own wallet set. SaphraONE provisions user-controlled (ENDUSER)
  // wallets, so a server-signed top up cannot sign for them — say that plainly
  // rather than surfacing a raw RPC dump.
  if (
    normalized.includes("cannot find target wallet") ||
    normalized.includes("not accessible to the caller")
  ) {
    return "This wallet is not one SaphraONE can sign for on that chain. Server-signed top ups need a developer-controlled Circle wallet that holds USDC on the source chain — connect a self-custody wallet and bridge from there instead.";
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
    return "SaphraONE cannot bridge from that network. Pick another source chain.";
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
   * SaphraONE balance the depositor was looking at.
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
