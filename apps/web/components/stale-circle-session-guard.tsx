"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useDisconnect } from "wagmi";

import { signOutForAppLock } from "@/lib/app-lock/client";
import {
  circleSignedOutNoticeKey,
  clearCircleSessionStale,
  isCircleSessionStale,
  readCircleLogin,
} from "@/lib/circle-session";

/**
 * When Circle can no longer use this sign-in on this device, the account is
 * signed out the next time the app opens (or comes back to the foreground),
 * so the person signs in fresh instead of meeting a failed payment. After the
 * sign-out, sign-in says why.
 */
export function StaleCircleSessionGuard() {
  const { disconnect } = useDisconnect();

  useEffect(() => {
    // The notice left by the sign-out below.
    try {
      if (window.sessionStorage.getItem(circleSignedOutNoticeKey)) {
        window.sessionStorage.removeItem(circleSignedOutNoticeKey);
        toast.info("You were signed out so Circle can verify this device again. Sign in to continue.", {
          duration: 8000,
        });
      }
    } catch {}

    let signingOut = false;
    function check() {
      if (signingOut || !isCircleSessionStale()) return;
      clearCircleSessionStale();
      // Nothing to sign out of (already signed out, or an external wallet).
      if (!readCircleLogin()) return;
      signingOut = true;
      try {
        window.sessionStorage.setItem(circleSignedOutNoticeKey, "1");
      } catch {}
      void signOutForAppLock(() => disconnect());
    }

    check();
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [disconnect]);

  return null;
}
