"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";

/**
 * Brings the wallet app forward for every request on a phone.
 *
 * Over WalletConnect, a signature or transaction is only delivered to the
 * wallet; nothing opens it. On a phone the user had to leave the browser and
 * find the request in the wallet themselves (OKX, Trust, Rainbow…). When a
 * request is sent, this opens the wallet through the app link it published
 * when it connected (its session metadata), so the user approves and returns.
 * Desktop and injected wallets are untouched.
 */

type WalletConnectEvents = {
  on: (event: string, listener: (payload: unknown) => void) => void;
  off?: (event: string, listener: (payload: unknown) => void) => void;
  removeListener?: (event: string, listener: (payload: unknown) => void) => void;
};

type WalletConnectProvider = {
  session?: { peer?: { metadata?: { redirect?: { native?: string; universal?: string } } } };
  signer?: { client?: { events?: WalletConnectEvents } };
};

/** Known app links for wallets whose session metadata leaves them out. */
const fallbackAppLinks: Record<string, string> = {
  okx: "okex://main",
};

/**
 * Wallets that already bring themselves forward on their own. MetaMask did
 * before this component existed; opening it again on top of that interfered
 * with its own hand-off.
 */
const handlesItsOwnRequests = new Set(["metaMask", "metaMaskSDK", "io.metamask"]);

/**
 * Only real app links (okex://, trust://…). An https "universal" link opened
 * from script usually loads in this tab instead of opening the app, replacing
 * SwiftPay mid-request, so those are never used.
 */
function appLinkOnly(link: string | undefined) {
  if (!link) return undefined;
  const scheme = link.split(":")[0]?.toLowerCase();
  return scheme && scheme !== "http" && scheme !== "https" ? link : undefined;
}

function isMobile() {
  return typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function WalletRequestDeepLink() {
  const { connector, status } = useAccount();

  useEffect(() => {
    if (
      status !== "connected" ||
      !connector ||
      connector.type !== "walletConnect" ||
      handlesItsOwnRequests.has(connector.id) ||
      !isMobile()
    ) {
      return;
    }

    let events: WalletConnectEvents | undefined;
    let cancelled = false;

    const openWallet = () => {
      if (document.visibilityState !== "visible") return;
      void connector.getProvider().then((raw) => {
        const provider = raw as WalletConnectProvider;
        const link =
          appLinkOnly(provider.session?.peer?.metadata?.redirect?.native) ??
          appLinkOnly(fallbackAppLinks[connector.id]);
        if (link) window.location.href = link;
      });
    };

    void connector.getProvider().then((raw) => {
      if (cancelled) return;
      events = (raw as WalletConnectProvider).signer?.client?.events;
      events?.on("session_request_sent", openWallet);
    });

    return () => {
      cancelled = true;
      if (events?.off) events.off("session_request_sent", openWallet);
      else events?.removeListener?.("session_request_sent", openWallet);
    };
  }, [connector, status]);

  return null;
}
