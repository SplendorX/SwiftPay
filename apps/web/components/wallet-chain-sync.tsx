"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { arcChain } from "@/lib/chains";

type ChainAwareProvider = { request: (args: { method: string }) => Promise<unknown>; chainId?: unknown };

function toChainId(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
  return undefined;
}

/**
 * Keeps the app's idea of the wallet's network in step with the wallet.
 *
 * On phones, MetaMask and other WalletConnect wallets often switch networks
 * without sending the "network changed" event back — so SwiftPay kept
 * showing "Switch network" (and a switch kept waiting) after the wallet had
 * already moved to Arc. When you come back from the wallet app, and every
 * few seconds while the app thinks you're on the wrong network, this asks the
 * wallet directly and tells wagmi if it had it wrong.
 */
export function WalletChainSync() {
  const { chainId, connector, status } = useAccount();
  const syncing = useRef(false);

  useEffect(() => {
    if (status !== "connected" || !connector) return;

    async function sync() {
      if (syncing.current || !connector) return;
      syncing.current = true;
      try {
        let actual: number | undefined;
        try {
          const provider = (await connector.getProvider()) as ChainAwareProvider | undefined;
          actual = toChainId(await provider?.request({ method: "eth_chainId" })) ?? toChainId(provider?.chainId);
        } catch {
          // Some wallets don't answer eth_chainId over WalletConnect.
        }
        actual ??= await connector.getChainId().catch(() => undefined);
        // Only ever catch up *to* Arc. Over WalletConnect, eth_chainId can
        // answer from the session's cached chain, which still holds the network
        // from before a switch the wallet never reported. Trusting it in every
        // direction dragged the app off Arc right after the user approved the
        // switch. Genuine moves away from Arc still arrive as wagmi events.
        if (actual === arcChain.id && actual !== chainId) {
          // The same event the wallet should have sent: updates every
          // useChainId/useAccount, and releases a switch waiting on it.
          connector.emitter.emit("change", { chainId: actual });
        }
      } finally {
        syncing.current = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // Only poll while the app believes the wallet is off Arc.
    const timer = chainId !== arcChain.id ? window.setInterval(() => void sync(), 3000) : undefined;
    void sync();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [chainId, connector, status]);

  return null;
}
