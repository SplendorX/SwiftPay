import { encodeFunctionData, maxUint256, type Address, type Hash } from "viem";

import { swiftPayVaultAbi } from "@/lib/earn/abis";
import {
  encodeErc20Approve,
  executeCircleContractCall,
  type CircleVaultExecutor,
} from "@/lib/save/circle-vault";

export async function circleEarnDeposit(input: {
  amountUnits: bigint;
  executor: CircleVaultExecutor;
  owner: Address;
  token: Address;
  vault: Address;
}) {
  const approval = await executeCircleContractCall({
    callData: encodeErc20Approve(input.vault, maxUint256),
    contractAddress: input.token,
    executor: input.executor,
    label: "earn approve",
    refId: `earn-approve-${Date.now()}`,
  });

  return executeCircleContractCall({
    callData: encodeFunctionData({
      abi: swiftPayVaultAbi,
      args: [input.amountUnits, input.owner],
      functionName: "deposit",
    }),
    contractAddress: input.vault,
    executor: input.executor,
    label: "earn deposit",
    refId: `earn-deposit-${Date.now()}`,
    skipHashes: approval.txHash ? [approval.txHash] : undefined,
  }) as Promise<{ txHash?: Hash; transactionId?: string }>;
}

export async function circleEarnWithdraw(input: {
  amountUnits: bigint;
  executor: CircleVaultExecutor;
  owner: Address;
  vault: Address;
}) {
  return executeCircleContractCall({
    callData: encodeFunctionData({
      abi: swiftPayVaultAbi,
      args: [input.amountUnits, input.owner, input.owner],
      functionName: "withdraw",
    }),
    contractAddress: input.vault,
    executor: input.executor,
    label: "earn withdraw",
    refId: `earn-withdraw-${Date.now()}`,
  }) as Promise<{ txHash?: Hash; transactionId?: string }>;
}
