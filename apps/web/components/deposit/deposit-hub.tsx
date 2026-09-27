"use client";

import { Banknote, CreditCard, HandCoins, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { DepositPanel } from "@/components/deposit/DepositPanel";
import { OnrampPanel } from "@/components/deposit/onramp-panel";
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
    blurb: "Buy USDC from your bank (US & Europe)",
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
  // Bank transfer goes live once the server has an Onramp key.
  const [onrampEnabled, setOnrampEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onramp/sessions", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { enabled?: boolean } | null) => {
        if (!cancelled) setOnrampEnabled(payload?.enabled === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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

  const available = methods.map((item) =>
    item.id === "bank" && onrampEnabled ? { ...item, soon: false } : item,
  );
  const active = available.find((item) => item.id === method) ?? available[0];

  return (
    <div className="deposit-hub">
      <nav aria-label="Deposit methods" className="deposit-method-list">
        {available.map((item) => {
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
        ) : active.id === "bank" ? (
          <OnrampPanel />
        ) : (
          <DepositPanel />
        )}
      </div>
    </div>
  );
}
