import {
  encodeFunctionData,
  erc20Abi as viemErc20Abi,
  maxUint256,
  zeroAddress,
  zeroHash,
  type Address,
  type Hash,
  type Hex,
} from "viem";

import {
  erc20Abi,
  getSwiftPaySendAddress,
  swiftPaySendAbi,
} from "@/lib/contracts";
import { callCircleWalletApi } from "@/lib/circle-session";

type ExternalWrite = (args: {
  address: Address;
  abi: typeof erc20Abi | typeof swiftPaySendAbi;
  functionName: string;
  args: readonly unknown[];
  chainId: number;
}) => Promise<Hash>;

type CircleExecutor = {
  execute: (callData: Hex, contractAddress: Address, refId: string) => Promise<{
    txHash?: string;
    transactionId?: string;
  }>;
};

export type BundledSendInput = {
  chainId: number;
  token: Address;
  recipient: Address;
  paymentUnits: bigint;
  feeUnits: bigint;
  feeRecipient: Address;
  router?: string;
  save?: {
    vault: Address;
    pocketId: Hex;
    amount: bigint;
  };
  mode: "external" | "circle";
  writeContractAsync?: ExternalWrite;
  readAllowance?: (spender: Address) => Promise<bigint>;
  circleExecutor?: CircleExecutor;
};

export type BundledSendResult = {
  txHash?: Hash;
  bundledSave: boolean;
};

export function sendRouterAddress(override?: string): Address | null {
  const value = (override || getSwiftPaySendAddress()).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null;
  }
  return value as Address;
}

function encodeErc20Approve(spender: Address, amount: bigint) {
  return encodeFunctionData({
    abi: viemErc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}

function encodeRouterSend(input: {
  token: Address;
  recipient: Address;
  paymentUnits: bigint;
  vault: Address;
  pocketId: Hex;
  saveAmount: bigint;
}) {
  return encodeFunctionData({
    abi: swiftPaySendAbi,
    functionName: "send",
    args: [
      input.token,
      input.recipient,
      input.paymentUnits,
      input.vault,
      input.pocketId,
      input.saveAmount,
    ],
  });
}

/**
 * Payment + 0.1% fee + optional Spend&Save in a single contract call.
 * Never opens a wallet prompt per leg.
 */
async function resolveSendRouter(override?: string): Promise<Address> {
  const fromInput = sendRouterAddress(override);
  if (fromInput) {
    return fromInput;
  }

  const fromEnv = sendRouterAddress();
  if (fromEnv) {
    return fromEnv;
  }

  if (typeof fetch === "function") {
    try {
      const response = await fetch("/api/platform/contracts", {
        cache: "no-store",
      });
      const payload = (await response.json()) as { sendRouter?: string };
      const fromApi = sendRouterAddress(payload.sendRouter);
      if (fromApi) {
        return fromApi;
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    "Send router is not configured. Set NEXT_PUBLIC_SWIFTPAY_SEND_ADDRESS.",
  );
}

export async function executeBundledSend(
  input: BundledSendInput,
): Promise<BundledSendResult> {
  const router = await resolveSendRouter(input.router);

  const saveAmount = input.save?.amount ?? 0n;
  const bundledSave = saveAmount > 0n;
  const total = input.paymentUnits + input.feeUnits + saveAmount;
  let allowance: bigint | null = null;
  if (input.readAllowance) {
    try {
      allowance = await input.readAllowance(router);
    } catch {
      allowance = null;
    }
  }
  const needsApproval = allowance !== null && allowance < total;

  async function approveRouter() {
    if (input.mode === "external") {
      if (!input.writeContractAsync) {
        throw new Error("Wallet writer is not available.");
      }
      await input.writeContractAsync({
        address: input.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [router, maxUint256],
        chainId: input.chainId,
      });
      return;
    }

    if (!input.circleExecutor) {
      throw new Error("Circle wallet is not ready.");
    }
    await input.circleExecutor.execute(
      encodeErc20Approve(router, maxUint256),
      input.token,
      "send-approve",
    );
  }

  if (needsApproval) {
    await approveRouter();
  }

  if (input.mode === "external") {
    if (!input.writeContractAsync) {
      throw new Error("Wallet writer is not available.");
    }

    try {
      const hash = await input.writeContractAsync({
        address: router,
        abi: swiftPaySendAbi,
        functionName: "send",
        args: [
          input.token,
          input.recipient,
          input.paymentUnits,
          input.save?.vault ?? zeroAddress,
          input.save?.pocketId ?? zeroHash,
          saveAmount,
        ],
        chainId: input.chainId,
      });
      return { txHash: hash, bundledSave };
    } catch (error) {
      if (allowance !== null) {
        throw error;
      }
      await approveRouter();
      const hash = await input.writeContractAsync({
        address: router,
        abi: swiftPaySendAbi,
        functionName: "send",
        args: [
          input.token,
          input.recipient,
          input.paymentUnits,
          input.save?.vault ?? zeroAddress,
          input.save?.pocketId ?? zeroHash,
          saveAmount,
        ],
        chainId: input.chainId,
      });
      return { txHash: hash, bundledSave };
    }
  }

  if (!input.circleExecutor) {
    throw new Error("Circle wallet is not ready.");
  }

  try {
    const result = await input.circleExecutor.execute(
      encodeRouterSend({
        token: input.token,
        recipient: input.recipient,
        paymentUnits: input.paymentUnits,
        vault: input.save?.vault ?? zeroAddress,
        pocketId: input.save?.pocketId ?? zeroHash,
        saveAmount,
      }),
      router,
      "send-bundle",
    );
    return {
      txHash: result.txHash as Hash | undefined,
      bundledSave,
    };
  } catch (error) {
    if (allowance !== null) {
      throw error;
    }
    await approveRouter();
    const result = await input.circleExecutor.execute(
      encodeRouterSend({
        token: input.token,
        recipient: input.recipient,
        paymentUnits: input.paymentUnits,
        vault: input.save?.vault ?? zeroAddress,
        pocketId: input.save?.pocketId ?? zeroHash,
        saveAmount,
      }),
      router,
      "send-bundle",
    );
    return {
      txHash: result.txHash as Hash | undefined,
      bundledSave,
    };
  }
}

export async function executeCircleContract(params: {
  userToken: string;
  walletId: string;
  contractAddress: Address;
  callData: Hex;
  refId?: string;
}) {
  return callCircleWalletApi<{
    challengeId?: string;
    id?: string;
  }>("createContractExecution", {
    callData: params.callData,
    contractAddress: params.contractAddress,
    feeLevel: "MEDIUM",
    refId: params.refId,
    userToken: params.userToken,
    walletId: params.walletId,
  });
}
