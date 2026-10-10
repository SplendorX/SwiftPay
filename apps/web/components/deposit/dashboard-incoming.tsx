"use client";

import { useEffect, useState } from "react";

import { IncomingDeposits } from "@/components/deposit/incoming-deposits";
import { fetchMultichainOverview, type IncomingDepositView } from "@/lib/multichain/client";
import { multichainEnabled } from "@/lib/multichain/flag";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

const POLL_MS = 30_000;
/** A credited deposit stays on the dashboard this long, so the arrival is seen. */
const RECENT_MS = 10 * 60 * 1000;

function shown(deposit: IncomingDepositView) {
  if (deposit.status === "failed") return false;
  if (deposit.status !== "credited") return true;
  return Boolean(deposit.creditedAt) && Date.now() - new Date(deposit.creditedAt!).getTime() < RECENT_MS;
}

/** "Arriving: +50.00 USDC from Base" on the dashboard, while it is on its way. */
export function DashboardIncoming() {
  const { address } = usePlatformWallet();
  const [deposits, setDeposits] = useState<IncomingDepositView[]>([]);

  useEffect(() => {
    if (!multichainEnabled || !address) {
      setDeposits([]);
      return;
    }
    let cancelled = false;
    async function load(wallet: string) {
      try {
        const overview = await fetchMultichainOverview(wallet);
        if (!cancelled) setDeposits(overview.deposits.filter(shown));
      } catch {
        // The dashboard carries on without it.
      }
    }
    void load(address);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(address);
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address]);

  if (deposits.length === 0) return null;
  return <IncomingDeposits deposits={deposits} />;
}
