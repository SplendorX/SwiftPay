"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";

import {
  circleSessionEventName,
  readCircleLogin,
  readCircleWallets,
} from "@/lib/circle-session";
import {
  platformAccessEventName,
  readActivatedExternalProfile,
} from "@/lib/platform-access";

export const signInModalEventName = "swiftpay:open-sign-in";

function hasLiveSignedInAccount(input?: {
  address?: string;
  isConnected?: boolean;
}) {
  if (typeof window === "undefined") {
    return false;
  }

  if (readCircleLogin() && readCircleWallets().some((wallet) => wallet.address)) {
    return true;
  }

  const activated = readActivatedExternalProfile().toLowerCase();
  const connected = input?.address?.toLowerCase() ?? "";
  return Boolean(
    input?.isConnected && activated && connected && activated === connected,
  );
}

export function useHasSignedIn() {
  const { address, isConnected } = useAccount();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    function refresh() {
      setSignedIn(hasLiveSignedInAccount({ address, isConnected }));
    }

    refresh();
    window.addEventListener(circleSessionEventName, refresh);
    window.addEventListener(platformAccessEventName, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(circleSessionEventName, refresh);
      window.removeEventListener(platformAccessEventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [address, isConnected]);

  return signedIn;
}

export function openSignInModal() {
  window.dispatchEvent(new CustomEvent(signInModalEventName));
}

export function LaunchAppLink({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const signedIn = useHasSignedIn();

  return (
    <Link
      className={className}
      href={signedIn ? "/dashboard" : "/#sign-in"}
      onClick={(event) => {
        event.preventDefault();
        if (hasLiveSignedInAccount({ address, isConnected })) {
          router.push("/dashboard");
          return;
        }

        if (window.location.pathname === "/") {
          openSignInModal();
          return;
        }

        window.location.assign("/#sign-in");
      }}
    >
      {children ?? "Open SwiftPay"}
    </Link>
  );
}
