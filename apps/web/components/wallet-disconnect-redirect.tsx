"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { readCircleLogin } from "@/lib/circle-session";
import { clearActivatedExternalProfile } from "@/lib/platform-access";
import { endWalletSession } from "@/lib/wallet-auth-client";

const publicRoutes = new Set(["/"]);

export function WalletDisconnectRedirect() {
  const { isConnected, status } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const wasConnectedRef = useRef(false);
  const disconnectTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") {
      if (disconnectTimeoutRef.current !== undefined) {
        window.clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = undefined;
      }
      return;
    }

    if (isConnected) {
      if (disconnectTimeoutRef.current !== undefined) {
        window.clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = undefined;
      }
      wasConnectedRef.current = true;
      return;
    }

    if (!wasConnectedRef.current) {
      return;
    }

    if (readCircleLogin()) {
      return;
    }

    // Debounce disconnect so that transient state changes during page reload,
    // account switching, or chain validation do not prematurely clear the session.
    if (disconnectTimeoutRef.current === undefined) {
      disconnectTimeoutRef.current = window.setTimeout(() => {
        disconnectTimeoutRef.current = undefined;
        wasConnectedRef.current = false;
        clearActivatedExternalProfile();
        void endWalletSession().catch(() => undefined);

        if (!publicRoutes.has(pathname)) {
          router.replace("/");
        }
      }, 1500);
    }

    return () => {
      if (disconnectTimeoutRef.current !== undefined) {
        window.clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = undefined;
      }
    };
  }, [isConnected, pathname, router, status]);

  return null;
}
