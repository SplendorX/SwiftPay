"use client";

/**
 * Send USDC from the user's Arc wallet to another network over CCTP v2:
 * burned on Arc (FAST), minted at the destination by Circle's Forwarding
 * Service, so the recipient needs no gas. Signs with whatever wallet the
 * session holds (a Circle PIN wallet through its EIP-1193 shim, or an
 * external wallet's own provider).
 */
import { AppKit, isRetryableError } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";

import { arcAppKitChain, isRejection } from "@/lib/deposit-to-arc";
import type { MultichainChain } from "@/lib/multichain/chains";

export const SEND_OUT_STEPS = ["approve", "burn", "attestation", "deliver"] as const;
export type SendOutStep = (typeof SEND_OUT_STEPS)[number];

export function sendOutStepLabel(step: SendOutStep, networkName: string) {
  switch (step) {
    case "approve":
      return "Approving USDC";
    case "burn":
      return "Sending from your balance";
    case "attestation":
      return "Circle is confirming it";
    default:
      return `Delivering on ${networkName}`;
  }
}

function stepFor(name: string): SendOutStep | null {
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
      return "deliver";
    default:
      return null;
  }
}

type BridgeStep = { error?: unknown; errorCategory?: string; errorMessage?: string; name?: string; state?: string; txHash?: string };
type BridgeResultLike = { state?: string; steps?: BridgeStep[] };

export class SendOutRejectedError extends Error {
  constructor() {
    super("Cancelled in the wallet.");
    this.name = "SendOutRejectedError";
  }
}

export type SendOutResult = {
  /** The Arc burn, once it exists. Without it nothing left the balance. */
  burnTxHash: string | null;
  /** The destination mint, when App Kit saw it land. */
  deliveredTxHash: string | null;
  /** Kept to resume a send that stopped before its burn. */
  result: unknown;
  /** True when App Kit can pick it up again from the last good step. */
  resumable: boolean;
  error: string | null;
};

/** App Kit results can carry bigints and Error objects; the server takes plain JSON. */
export function plainResult(value: unknown) {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, inner) =>
        typeof inner === "bigint"
          ? inner.toString()
          : inner instanceof Error
            ? { message: inner.message, name: inner.name }
            : inner,
      ),
    ) as unknown;
  } catch {
    return null;
  }
}

function hashOf(result: BridgeResultLike, wanted: SendOutStep) {
  return result.steps?.find((step) => stepFor(step.name ?? "") === wanted && step.txHash)?.txHash ?? null;
}

export async function sendUsdcFromArc(input: {
  amount: string;
  destination: MultichainChain;
  /**
   * Fires once the burn is mined, before App Kit waits on Circle. The burn is
   * the last step the wallet signs, so the caller can stop waiting here.
   */
  onBurn?: (burnTxHash: string) => void;
  onStep?: (step: SendOutStep) => void;
  provider: unknown;
  recipient: string;
  resumeFrom?: unknown;
}): Promise<SendOutResult> {
  const adapter = await createViemAdapterFromProvider({
    provider: input.provider as Parameters<typeof createViemAdapterFromProvider>[0]["provider"],
  });

  // A fresh kit per send: App Kit never clears its handlers.
  const kit = new AppKit();
  // App Kit sends each step's event once that step has finished.
  const onAction = (payload: unknown) => {
    const event = payload as { method?: unknown; values?: { state?: unknown; txHash?: unknown } } | null;
    const step = typeof event?.method === "string" ? stepFor(event.method) : null;
    if (step) input.onStep?.(step);
    const txHash = event?.values?.txHash;
    if (step === "burn" && event?.values?.state === "success" && typeof txHash === "string") {
      input.onBurn?.(txHash);
    }
  };
  kit.on("*", onAction);

  let result: BridgeResultLike;
  try {
    result = (
      input.resumeFrom
        ? await kit.retryBridge(input.resumeFrom as Parameters<typeof kit.retryBridge>[0], { from: adapter })
        : await kit.bridge({
            amount: input.amount,
            config: { transferSpeed: "FAST" },
            from: { adapter, chain: arcAppKitChain() },
            to: {
              chain: input.destination.appKitChain,
              recipientAddress: input.recipient,
              // Circle mints at the destination; the recipient needs no gas.
              useForwarder: true,
            },
          })
    ) as BridgeResultLike;
  } catch (cause) {
    if (isRejection(cause)) throw new SendOutRejectedError();
    throw cause;
  } finally {
    kit.off("*", onAction);
  }

  const failed = result.steps?.find((step) => step.state === "error");
  if (result.state === "error" && (failed?.errorCategory === "user_rejected" || isRejection(failed?.errorMessage))) {
    if (!hashOf(result, "burn")) throw new SendOutRejectedError();
  }

  let resumable = false;
  if (result.state === "error" && failed) {
    try {
      resumable = failed.error !== undefined ? isRetryableError(failed.error) : true;
    } catch {
      resumable = true;
    }
  }

  return {
    burnTxHash: hashOf(result, "burn"),
    deliveredTxHash: hashOf(result, "deliver"),
    error: result.state === "error" ? (failed?.errorMessage?.split("\n")[0] ?? "The send stopped partway.") : null,
    result,
    resumable,
  };
}
