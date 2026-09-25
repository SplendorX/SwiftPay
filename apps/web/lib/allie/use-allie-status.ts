"use client";

import { useCallback, useEffect, useState } from "react";

import type { AllieStatus } from "@/components/allie/StatusIndicator";
import { fetchAgentWallet } from "@/lib/allie/client";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import {
  markAgentWalletActive,
  walletModeEventName,
} from "@/lib/wallet-mode";

/**
 * Agent wallet status for the nav and chat header.
 * Silent on failure — a status badge must never surface an error to the user.
 */
export function useAllieStatus() {
  const { address, circleSocialUuid } = usePlatformWallet();
  const [status, setStatus] = useState<AllieStatus>("not_created");

  const refresh = useCallback(async () => {
    if (!address) {
      setStatus("not_created");
      return;
    }

    try {
      const payload = await fetchAgentWallet({
        ownerWallet: address,
        circleSocialUuid,
      });
      const next = payload.agentWallet?.status ?? "not_created";
      setStatus(next);
      markAgentWalletActive(next === "active");
    } catch {
      setStatus("not_created");
    }
  }, [address, circleSocialUuid]);

  useEffect(() => {
    void refresh();

    function handle() {
      void refresh();
    }

    window.addEventListener(walletModeEventName, handle);
    return () => window.removeEventListener(walletModeEventName, handle);
  }, [refresh]);

  return { status, refresh };
}
