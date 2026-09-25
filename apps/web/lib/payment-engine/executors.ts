import type { Address, Hash, Hex } from "viem";

import { platformFeeUnits, SEND_FEE_BPS } from "@/lib/fees";
import { arcTokens } from "@/lib/tokens";

import type {
  PaymentIntent,
  PaymentIntentAsset,
} from "@/lib/payment-engine/intent";

/**
 * One interface so the router can call any wallet type uniformly.
 * Circle user wallets, external (wagmi) wallets, and ALLIE's Agent Wallet
 * are all implementations of this.
 */
export interface WalletExecutor {
  execute(intent: PaymentIntent): Promise<ExecutionResult>;
  estimateFee(intent: PaymentIntent): Promise<bigint>;
  getBalance(asset: PaymentIntentAsset): Promise<bigint>;
}

export type ExecutionResult = {
  txHash?: string;
  transactionId?: string;
  status: "submitted" | "failed";
  error?: string;
};

export type ExecutorMode = "external" | "circle" | "agent";

/** Structurally compatible with wagmi's `writeContractAsync`. */
type ExternalWrite = (args: {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  chainId: number;
}) => Promise<Hash>;

export type ExternalExecutorDeps = {
  /** wagmi's writeContractAsync, bound to the connected wallet. */
  writeContractAsync: ExternalWrite;
  /** Reads the router allowance so the send can skip a redundant approve. */
  readAllowance?: (spender: Address) => Promise<bigint>;
  /** ERC-20 balanceOf for the connected address. */
  readBalance?: (token: Address) => Promise<bigint>;
  feeRecipient: Address;
  sendRouter?: string;
};

export type CircleExecutorDeps = {
  /** Same shape execute-send already accepts for Circle user wallets. */
  circleExecutor: {
    execute: (
      callData: Hex,
      contractAddress: Address,
      refId: string,
    ) => Promise<{ txHash?: string; transactionId?: string }>;
  };
  readAllowance?: (spender: Address) => Promise<bigint>;
  readBalance?: (token: Address) => Promise<bigint>;
  feeRecipient: Address;
  sendRouter?: string;
};

export type AgentExecutorDeps = {
  walletId: string;
  /** Injected so this module stays free of the Circle DCW SDK import. */
  transfer: (walletId: string, intent: PaymentIntent) => Promise<ExecutionResult>;
  balance: (walletId: string, asset: PaymentIntentAsset) => Promise<bigint>;
};

export type ExecutorDeps =
  | ({ mode: "external" } & ExternalExecutorDeps)
  | ({ mode: "circle" } & CircleExecutorDeps)
  | ({ mode: "agent" } & AgentExecutorDeps);

function tokenAddressFor(asset: PaymentIntentAsset): Address {
  return arcTokens[asset].address;
}

function requireRecipient(intent: PaymentIntent): Address {
  const recipient = intent.resolvedRecipient;

  if (!recipient) {
    throw new Error(
      "Intent recipient has not been resolved to an address yet.",
    );
  }

  return recipient;
}

function failed(error: unknown): ExecutionResult {
  return {
    status: "failed",
    error:
      error instanceof Error ? error.message : "Payment could not be executed.",
  };
}

/**
 * Wraps the existing bundled send (payment + 0.1% fee + optional Spend&Save
 * in one contract call). The send logic itself is not duplicated here.
 *
 * The import is deferred because `execute-send` reaches into browser-only
 * Circle session code — this executor only ever runs client-side.
 */
export class ExternalWalletExecutor implements WalletExecutor {
  constructor(private readonly deps: ExternalExecutorDeps) {}

  async execute(intent: PaymentIntent): Promise<ExecutionResult> {
    try {
      const { executeBundledSend } = await import("@/lib/payments/execute-send");
      const token = tokenAddressFor(intent.asset);

      const result = await executeBundledSend({
        chainId: intent.chainId,
        token,
        recipient: requireRecipient(intent),
        paymentUnits: intent.amountUnits,
        feeUnits: platformFeeUnits(intent.amountUnits, SEND_FEE_BPS),
        feeRecipient: this.deps.feeRecipient,
        router: this.deps.sendRouter,
        mode: "external",
        writeContractAsync: this.deps
          .writeContractAsync as unknown as Parameters<
          typeof executeBundledSend
        >[0]["writeContractAsync"],
        readAllowance: this.deps.readAllowance,
      });

      return { txHash: result.txHash, status: "submitted" };
    } catch (error) {
      return failed(error);
    }
  }

  async estimateFee(intent: PaymentIntent) {
    return platformFeeUnits(intent.amountUnits, SEND_FEE_BPS);
  }

  async getBalance(asset: PaymentIntentAsset) {
    if (!this.deps.readBalance) {
      return 0n;
    }

    return this.deps.readBalance(tokenAddressFor(asset));
  }
}

/**
 * Circle user-controlled wallet. Goes through the same bundled send, which
 * dispatches to `callCircleWalletApi` under the hood.
 */
export class CircleUserWalletExecutor implements WalletExecutor {
  constructor(private readonly deps: CircleExecutorDeps) {}

  async execute(intent: PaymentIntent): Promise<ExecutionResult> {
    try {
      const { executeBundledSend } = await import("@/lib/payments/execute-send");
      const token = tokenAddressFor(intent.asset);

      const result = await executeBundledSend({
        chainId: intent.chainId,
        token,
        recipient: requireRecipient(intent),
        paymentUnits: intent.amountUnits,
        feeUnits: platformFeeUnits(intent.amountUnits, SEND_FEE_BPS),
        feeRecipient: this.deps.feeRecipient,
        router: this.deps.sendRouter,
        mode: "circle",
        circleExecutor: this.deps.circleExecutor,
        readAllowance: this.deps.readAllowance,
      });

      return {
        txHash: result.txHash,
        transactionId: result.transactionId,
        status: "submitted",
      };
    } catch (error) {
      return failed(error);
    }
  }

  async estimateFee(intent: PaymentIntent) {
    return platformFeeUnits(intent.amountUnits, SEND_FEE_BPS);
  }

  async getBalance(asset: PaymentIntentAsset) {
    if (!this.deps.readBalance) {
      return 0n;
    }

    return this.deps.readBalance(tokenAddressFor(asset));
  }
}

/**
 * ALLIE's Agent Wallet (Circle developer-controlled). Server-side only.
 * The transfer and balance calls are injected by `@/lib/agent-wallet/client`
 * so this module never pulls the DCW SDK into a browser bundle.
 */
export class AgentWalletExecutor implements WalletExecutor {
  constructor(private readonly deps: AgentExecutorDeps) {}

  async execute(intent: PaymentIntent): Promise<ExecutionResult> {
    try {
      return await this.deps.transfer(this.deps.walletId, intent);
    } catch (error) {
      return failed(error);
    }
  }

  async estimateFee(intent: PaymentIntent) {
    return platformFeeUnits(intent.amountUnits, SEND_FEE_BPS);
  }

  async getBalance(asset: PaymentIntentAsset) {
    return this.deps.balance(this.deps.walletId, asset);
  }
}

export function createExecutor(
  mode: ExecutorMode,
  deps: ExecutorDeps,
): WalletExecutor {
  if (deps.mode !== mode) {
    throw new Error(
      `Executor deps are for "${deps.mode}" but "${mode}" was requested.`,
    );
  }

  switch (deps.mode) {
    case "agent":
      return new AgentWalletExecutor(deps);
    case "circle":
      return new CircleUserWalletExecutor(deps);
    case "external":
      return new ExternalWalletExecutor(deps);
    default: {
      const exhaustive: never = deps;
      throw new Error(`Unknown executor mode: ${String(exhaustive)}`);
    }
  }
}
