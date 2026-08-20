"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { circleSessionEventName } from "@/lib/circle-session";
import {
  readPreferredWalletMode,
  resolvePlatformWalletMode,
  walletModeEventName,
  writePreferredWalletMode,
  type WalletMode,
} from "@/lib/wallet-mode";

export function usePreferredWalletMode(
  fallback: WalletMode = "circle",
): [WalletMode, (mode: WalletMode | ((current: WalletMode) => WalletMode)) => void] {
  const [mode, setMode] = useState<WalletMode>(() => {
    if (typeof window === "undefined") {
      return fallback;
    }

    return readPreferredWalletMode() ?? resolvePlatformWalletMode();
  });
  const persistChanges = useRef(false);

  useEffect(() => {
    function refresh() {
      setMode(readPreferredWalletMode() ?? resolvePlatformWalletMode());
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

  useEffect(() => {
    if (!persistChanges.current) {
      return;
    }

    persistChanges.current = false;
    writePreferredWalletMode(mode);
  }, [mode]);

  const setWalletMode = useCallback(
    (next: WalletMode | ((current: WalletMode) => WalletMode)) => {
      persistChanges.current = true;
      setMode((current) =>
        typeof next === "function" ? next(current) : next,
      );
    },
    [],
  );

  return [mode, setWalletMode];
}
