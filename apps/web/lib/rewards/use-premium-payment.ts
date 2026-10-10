"use client";

import { useCallback } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  getAddress,
  isAddress,
  parseUnits,
  type Chain,
  type EIP1193Provider,
} from "viem";

import { arcChain, arcTransport } from "@/lib/chains";
import { platformFeeRecipient } from "@/lib/fees";
import { arcTokens } from "@/lib/tokens";
import { confirmFlow } from "@/lib/tx-approval/client";
import { useSigningWallet } from "@/lib/use-signing-wallet";

/**
 * Pay for a premium feature in USDC (Rewards v2): a USDC transfer from the
 * signed-in wallet to the platform fee wallet, with one confirmation. Returns
 * the payment hash, which the server verifies on Arc before granting access.
 */
export function usePremiumPayment() {
  const wallet = useSigningWallet();

  const pay = useCallback(
    async (input: { amountUsdc: number; title: string }) => {
      const recipient = platformFeeRecipient();
      if (!isAddress(recipient)) throw new Error("Payments for this feature aren't set up yet.");
      if (!wallet.resolveProvider || !wallet.address) {
        throw new Error(wallet.reason ?? "Connect a wallet to pay.");
      }
      const resolveProvider = wallet.resolveProvider;
      const account = getAddress(wallet.address);
      const chain = arcChain as Chain;
      const amount = input.amountUsdc.toFixed(arcTokens.USDC.decimals);

      return confirmFlow(
        wallet.circleWalletId,
        { amount, maxUses: 2, recipients: [recipient], title: input.title, token: "USDC" },
        async () => {
          const walletClient = createWalletClient({
            account,
            chain,
            transport: custom((await resolveProvider()) as EIP1193Provider),
          });
          const hash = await walletClient.writeContract({
            abi: erc20Abi,
            address: arcTokens.USDC.address,
            args: [getAddress(recipient), parseUnits(amount, arcTokens.USDC.decimals)],
            functionName: "transfer",
          });
          const receipt = await createPublicClient({ chain, transport: arcTransport() }).waitForTransactionReceipt({
            hash,
          });
          if (receipt.status !== "success") throw new Error("The payment failed on Arc. Nothing was charged.");
          return hash;
        },
      );
    },
    [wallet],
  );

  return { canPay: wallet.canSign, pay };
}
