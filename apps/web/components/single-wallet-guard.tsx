"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";

import { circleSessionEventName, readCircleLogin } from "@/lib/circle-session";
import {
  forgetActivatedExternalProfile,
  readActivatedExternalProfile,
} from "@/lib/platform-access";

/**
 * Pages where a Google/email user may connect an external wallet purely as a
 * source of funds: bridging USDC in, or paying someone's invoice. The wallet
 * is never tied to their profile there.
 */
function allowsFundingWallet(pathname: string | null) {
  return pathname === "/deposit" || Boolean(pathname?.startsWith("/invoice/"));
}

/**
 * One wallet per profile. A Google/email session runs on its Circle wallet
 * only, so an external wallet connected alongside it (or reconnected by the
 * wallet extension on load) is dropped, and never activated as a profile.
 * To use an external wallet, the person signs out first.
 */
export function SingleWalletGuard() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const pathname = usePathname();

  useEffect(() => {
    function enforce() {
      if (!readCircleLogin()) {
        return;
      }

      if (readActivatedExternalProfile()) {
        forgetActivatedExternalProfile();
      }

      if (isConnected && !allowsFundingWallet(pathname)) {
        disconnect();
      }
    }

    enforce();
    window.addEventListener(circleSessionEventName, enforce);
    return () => window.removeEventListener(circleSessionEventName, enforce);
  }, [disconnect, isConnected, pathname]);

  return null;
}
