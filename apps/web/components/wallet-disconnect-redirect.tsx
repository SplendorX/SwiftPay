"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

import { readCircleLogin } from "@/lib/circle-session";
import { clearActivatedExternalProfile } from "@/lib/platform-access";
import { endWalletSession } from "@/lib/wallet-auth-client";

const publicRoutes = new Set(["/", "/roadmap"]);

export function WalletDisconnectRedirect() {
  const { isConnected, status } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") {
      return;
    }

    if (isConnected) {
      wasConnectedRef.current = true;
      return;
    }

    if (!wasConnectedRef.current) {
      return;
    }

    wasConnectedRef.current = false;

    if (readCircleLogin()) {
      return;
    }

    clearActivatedExternalProfile();
    void endWalletSession().catch(() => undefined);

    if (!publicRoutes.has(pathname)) {
      router.replace("/");
    }
  }, [isConnected, pathname, router, status]);

  return null;
}
