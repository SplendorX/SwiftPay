import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  erc20Abi,
  recurringPlatformFeeBasisPoints,
  swiftRecurepayExecutorAbi,
  swiftRecurepayExecutorAddress,
} from "@/lib/contracts";
import { buildAutopayExecutionId } from "@/lib/recurring-utils";
import { arcTokens, type ArcTokenSymbol } from "@/lib/tokens";
import { arcChain } from "@/lib/chains";

function getOperatorPrivateKey() {
  return process.env.SWIFTPAY_RECURRING_OPERATOR_PRIVATE_KEY?.trim() || null;
}

export function isRecurringOperatorConfigured() {
  return Boolean(swiftRecurepayExecutorAddress && getOperatorPrivateKey());
}

export function createRecurringPublicClient() {
  return createPublicClient({
    chain: arcChain,
    transport: http(arcChain.rpcUrls.default.http[0]),
  });
}

export function createRecurringArcClients() {
  const privateKey = getOperatorPrivateKey();
  if (!privateKey) {
    return null;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createRecurringPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(arcChain.rpcUrls.default.http[0]),
  });

  return { account, publicClient, walletClient };
}

export function computeRecurringFeeUnits(amountUnits: bigint) {
  return (amountUnits * BigInt(recurringPlatformFeeBasisPoints)) / 10_000n;
}

export type CircleAdapterSubmitInput = {
  amountUnits: bigint;
  executionId: string;
  /** The payer's on-chain mandate; it fixes the recipient, token and cap. */
  mandateId: Hex;
};

export type CircleAdapterSubmitResult =
  | { ok: true; alreadyConsumed: false; txHash: Hash }
  | { ok: true; alreadyConsumed: true; txHash?: Hash }
  | { ok: false; error: string; permanent?: boolean };

/**
 * On-chain adapter for autonomous Autopay.
 * Uses the platform operator key against SwiftRecurepayExecutor — never a user key.
 * Circle user-controlled wallets authorize via a one-time ERC-20 approve.
 */
export async function circleAdapterSubmitPayment(
  input: CircleAdapterSubmitInput,
): Promise<CircleAdapterSubmitResult> {
  if (!swiftRecurepayExecutorAddress) {
    return { error: "RecurePay executor is not configured.", ok: false };
  }

  const clients = createRecurringArcClients();
  if (!clients) {
    return { error: "Recurring operator wallet is not configured.", ok: false };
  }

  const onchainOperator = await clients.publicClient.readContract({
    abi: swiftRecurepayExecutorAbi,
    address: swiftRecurepayExecutorAddress as Address,
    functionName: "operator",
  });

  if (onchainOperator.toLowerCase() !== clients.account.address.toLowerCase()) {
    return {
      error: "Recurring operator wallet does not match the onchain executor operator.",
      ok: false,
      permanent: true,
    };
  }

  const executionKey = buildAutopayExecutionId(input.executionId);
  const alreadyConsumed = await clients.publicClient.readContract({
    abi: swiftRecurepayExecutorAbi,
    address: swiftRecurepayExecutorAddress as Address,
    args: [executionKey],
    functionName: "consumedExecutionIds",
  });

  if (alreadyConsumed) {
    return { alreadyConsumed: true, ok: true };
  }

  try {
    const hash = await clients.walletClient.writeContract({
      abi: swiftRecurepayExecutorAbi,
      address: swiftRecurepayExecutorAddress as Address,
      args: [executionKey, input.mandateId, input.amountUnits],
      functionName: "executeRecurringPayment",
    });

    return { alreadyConsumed: false, ok: true, txHash: hash as Hash };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Autopay transaction failed.";
    const permanent =
      /already executed|not operator|mandate ?inactive|mandate ?expired|exceeds ?mandate ?limit/i.test(
        message,
      );
    return { error: message, ok: false, permanent };
  }
}

export async function circleAdapterReadBalanceAndAllowance(input: {
  payer: Address;
  tokenSymbol: ArcTokenSymbol;
}) {
  if (!swiftRecurepayExecutorAddress) {
    return { allowance: 0n, balance: 0n, configured: false as const };
  }

  const publicClient = createRecurringPublicClient();
  const tokenInfo = arcTokens[input.tokenSymbol];
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({
      abi: erc20Abi,
      address: tokenInfo.address,
      args: [input.payer],
      functionName: "balanceOf",
    }),
    publicClient.readContract({
      abi: erc20Abi,
      address: tokenInfo.address,
      args: [input.payer, swiftRecurepayExecutorAddress as Address],
      functionName: "allowance",
    }),
  ]);

  return { allowance, balance, configured: true as const };
}

export async function circleAdapterGetReceipt(txHash: Hash) {
  const publicClient = createRecurringPublicClient();
  try {
    return await publicClient.getTransactionReceipt({ hash: txHash });
  } catch {
    return null;
  }
}

export async function circleAdapterWasConsumed(executionId: string) {
  if (!swiftRecurepayExecutorAddress) {
    return false;
  }

  const publicClient = createRecurringPublicClient();
  return publicClient.readContract({
    abi: swiftRecurepayExecutorAbi,
    address: swiftRecurepayExecutorAddress as Address,
    args: [buildAutopayExecutionId(executionId)],
    functionName: "consumedExecutionIds",
  });
}
