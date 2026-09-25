"use client";

import { Banknote, CreditCard, HandCoins, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { DepositPanel } from "@/components/deposit/DepositPanel";
import { ReceiveShareCard } from "@/components/dashboard/receive-share-card";
import { fetchProfile, profileUpdatedEventName } from "@/lib/profile";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

type DepositMethod = "receive" | "chain" | "card" | "bank";

const methods: Array<{
  blurb: string;
  icon: typeof Wallet;
  id: DepositMethod;
  label: string;
  soon?: boolean;
}> = [
  {
    blurb: "Share your handle, address or a QR to get paid",
    icon: HandCoins,
    id: "receive",
    label: "Get paid",
  },
  {
    blurb: "Bridge USDC in from another chain",
    icon: Wallet,
    id: "chain",
    label: "From another chain",
  },
  {
    blurb: "Top up with a debit or credit card",
    icon: CreditCard,
    id: "card",
    label: "Card",
    soon: true,
  },
  {
    blurb: "Fund from a linked bank account",
    icon: Banknote,
    id: "bank",
    label: "Bank transfer",
    soon: true,
  },
];

export function DepositHub() {
  const { address, isConnected } = usePlatformWallet();
  const [method, setMethod] = useState<DepositMethod>("receive");
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setUsername(null);
      return;
    }

    let cancelled = false;

    async function load(wallet: string) {
      try {
        const profile = await fetchProfile(wallet);
        if (!cancelled) {
          setUsername(profile?.username ?? null);
        }
      } catch {
        if (!cancelled) {
          setUsername(null);
        }
      }
    }

    void load(address);

    // Keep the share card in step if the handle changes in settings.
    function handleProfileUpdated() {
      if (address) void load(address);
    }

    window.addEventListener(profileUpdatedEventName, handleProfileUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(profileUpdatedEventName, handleProfileUpdated);
    };
  }, [address]);

  const active = methods.find((item) => item.id === method) ?? methods[0];

  return (
    <div className="deposit-hub">
      <nav aria-label="Deposit methods" className="deposit-method-list">
        {methods.map((item) => {
          const Icon = item.icon;
          const isActive = !item.soon && item.id === method;

          return (
            <button
              aria-current={isActive ? "true" : undefined}
              className={`deposit-method ${isActive ? "deposit-method-active" : ""}`}
              disabled={item.soon}
              key={item.id}
              onClick={() => setMethod(item.id)}
              type="button"
            >
              <span className="deposit-method-icon">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="deposit-method-label">
                  {item.label}
                  {item.soon ? (
                    <span className="deposit-method-soon">Soon</span>
                  ) : null}
                </span>
                <span className="deposit-method-blurb">{item.blurb}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="deposit-method-panel">
        {active.id === "receive" ? (
          <ReceiveShareCard
            isConnected={isConnected}
            username={username}
            walletAddress={address ?? ""}
          />
        ) : (
          <DepositPanel />
        )}
      </div>
    </div>
  );
}
