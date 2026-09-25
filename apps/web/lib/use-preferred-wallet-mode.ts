"use client";

import { useCallback, useEffect, useState } from "react";

import { circleSessionEventName } from "@/lib/circle-session";
import {
  resolvePlatformWalletMode,
  walletModeEventName,
  type PlatformWalletMode,
} from "@/lib/wallet-mode";

/**
 * The wallet this session runs on. One wallet per profile: it follows the
 * sign-in (Google/email -> Circle wallet, otherwise the connected wallet), so
 * the setter cannot pick the other one. It only re-reads the session, for
 * pages that call it after a sign-in or sign-out.
 */
export function usePreferredWalletMode(
  fallback: PlatformWalletMode = "circle",
): [PlatformWalletMode, (mode: PlatformWalletMode | ((current: PlatformWalletMode) => PlatformWalletMode)) => void] {
  // Start from the fallback on the server *and* the first browser render, so
  // the two match; the effect below switches to the real mode right after.
  // Reading storage here made the phone's first render differ from the
  // server's (React #418), and BatchPay — the one page with an "external"
  // fallback — failed to open for Google/email sign-ins.
  const [mode, setMode] = useState<PlatformWalletMode>(fallback);

  useEffect(() => {
    function refresh() {
      setMode(resolvePlatformWalletMode());
    }

    refresh();
    window.addEventListener(walletModeEventName, refresh);
    window.addEventListener(circleSessionEventName, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(walletModeEventName, refresh);
      window.removeEventListener(circleSessionEventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const setWalletMode = useCallback(
    // The requested mode is ignored on purpose; see above.
    (_next: PlatformWalletMode | ((current: PlatformWalletMode) => PlatformWalletMode)) => {
      setMode(resolvePlatformWalletMode());
    },
    [],
  );

  return [mode, setWalletMode];
}
