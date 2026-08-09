"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAccount, useSignMessage } from "wagmi";

import {
  circleSessionEventName,
  readCircleLogin,
} from "@/lib/circle-session";
import {
  readActivatedExternalProfile,
  platformAccessEventName,
} from "@/lib/platform-access";
import {
  fetchWalletSessionForAddress,
  signInWalletSession,
  walletSessionChangedEventName,
} from "@/lib/wallet-auth-client";

/**
 * After external wallet sign-in / connect, automatically start a server wallet
 * session (sign message) so notifications, savings, and recurring APIs work.
 * Circle users authorize via profile + social UUID instead.
 */
export function WalletSessionBootstrap() {
  const { address, isConnected, connector, status } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const inFlightRef = useRef(false);
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function ensureAuthorized() {
      if (cancelled || inFlightRef.current) {
        return;
      }

      // Circle embedded path uses social UUID auth — skip SIWE popup.
      if (readCircleLogin()) {
        return;
      }

      if (!isConnected || !address || status === "reconnecting") {
        return;
      }

      const activated = readActivatedExternalProfile();
      if (!activated || activated !== address.toLowerCase()) {
        // Platform profile not activated for this wallet yet.
        return;
      }

      const key = address.toLowerCase();
      if (attemptedRef.current.has(key)) {
        return;
      }

      try {
        const existing = await fetchWalletSessionForAddress(address);
        if (cancelled) return;
        if (existing.authenticated) {
          attemptedRef.current.add(key);
          return;
        }
      } catch {
        // Proceed to sign-in.
      }

      inFlightRef.current = true;
      attemptedRef.current.add(key);

      try {
        await signInWalletSession({
          connectorName: connector?.name,
          ownerWallet: address,
          signMessage: (message) => signMessageAsync({ message }),
        });
        if (!cancelled) {
          toast.success("Wallet authorized", {
            description: "Notifications and secure actions are enabled for this wallet.",
          });
        }
      } catch (error) {
        // Allow a later retry if the user rejected or signing failed.
        attemptedRef.current.delete(key);
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Authorization failed";
          // Avoid spamming for expected user rejections.
          if (!/reject|denied|cancel/i.test(message)) {
            toast.error("Authorize wallet", {
              description:
                "Sign the message when prompted so you can receive notifications and use savings.",
            });
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    void ensureAuthorized();

    function onAccessChange() {
      void ensureAuthorized();
    }

    window.addEventListener(platformAccessEventName, onAccessChange);
    window.addEventListener(circleSessionEventName, onAccessChange);
    window.addEventListener(walletSessionChangedEventName, onAccessChange);

    return () => {
      cancelled = true;
      window.removeEventListener(platformAccessEventName, onAccessChange);
      window.removeEventListener(circleSessionEventName, onAccessChange);
      window.removeEventListener(walletSessionChangedEventName, onAccessChange);
    };
  }, [address, connector?.name, isConnected, signMessageAsync, status]);

  return null;
}
