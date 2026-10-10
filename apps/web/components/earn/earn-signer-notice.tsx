"use client";

import { AlertCircle } from "lucide-react";

import { WalletConnectButton } from "@/components/wallet-connect-button";

/**
 * Shown when no wallet in this session can sign a vault transaction.
 *
 * Both wallet kinds are supported — a Google session signs through its Circle
 * wallet's PIN challenge, and everyone else through their connected wallet —
 * so reaching this means neither is available yet.
 */
export function EarnExternalWalletNotice({
  reason,
}: {
  reason?: string | null;
}) {
  return (
    <div className="earn-form earn-panel-form">
      <p className="earn-error">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{reason || "Invest needs a signed-in wallet."}</span>
      </p>
      <p className="earn-footnote mt-2">
        Vault deposits and withdrawals are signed by your own wallet, so the
        position and the funds stay yours. Sign in with Google to use your
        SaphraONE wallet, or connect an external wallet holding USDC on Arc.
      </p>
      <p className="earn-footnote mt-2">
        Vaults and APYs stay browsable either way.
      </p>
      <div className="mt-3">
        <WalletConnectButton />
      </div>
    </div>
  );
}
