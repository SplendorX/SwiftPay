"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  LayoutGrid,
  PieChart,
  Repeat,
  Wallet,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AutoDepositPanel } from "@/components/earn/auto-deposit-panel";
import { EarnDeposit } from "@/components/earn/EarnDeposit";
import { EarnPosition } from "@/components/earn/EarnPosition";
import { EarnVaultList } from "@/components/earn/EarnVaultList";
import { EarnWithdraw } from "@/components/earn/EarnWithdraw";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useEarnVaults, useSelectedEarnVault } from "@/hooks/useEarnVaults";
import { formatApy, vaultName } from "@/lib/earn/display";
import { useEarnWallet } from "@/lib/earn/use-earn-wallet";
import type { EarnTab } from "@/lib/earn/types";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { cn } from "@/lib/utils";

const tabs: Array<{ icon: typeof LayoutGrid; id: EarnTab; label: string }> = [
  { icon: LayoutGrid, id: "vaults", label: "Vaults" },
  { icon: PieChart, id: "position", label: "Position" },
  { icon: ArrowDownToLine, id: "deposit", label: "Deposit" },
  { icon: ArrowUpFromLine, id: "withdraw", label: "Withdraw" },
  { icon: Repeat, id: "automate", label: "Automate" },
];

const PANEL_TITLES: Partial<Record<EarnTab, string>> = {
  automate: "Automatic deposits",
  deposit: "Deposit USDC",
  withdraw: "Withdraw USDC",
};

export function EarnPage() {
  const searchParams = useSearchParams();
  const { address, circleSocialUuid, isConnected } = usePlatformWallet();
  const { error, loading, vaults } = useEarnVaults();
  // Google sessions sign with their Circle wallet, everyone else with theirs.
  const earnWallet = useEarnWallet();
  const { selectVault, vaultAddress } = useSelectedEarnVault();
  // ALLIE's handoff names the tab "intent"; older links use "action".
  const initialAction = searchParams.get("action") ?? searchParams.get("intent");
  const linkAmount = searchParams.get("amount")?.trim() ?? "";
  const initialAmount = /^\d+(\.\d+)?$/.test(linkAmount) ? linkAmount : "";
  const [tab, setTab] = useState<EarnTab>(() => {
    if (initialAction === "deposit") return "deposit";
    if (initialAction === "withdraw") return "withdraw";
    if (initialAction === "automate") return "automate";
    return "vaults";
  });

  useEffect(() => {
    if (
      initialAction === "deposit" ||
      initialAction === "withdraw" ||
      initialAction === "automate"
    ) {
      setTab(initialAction);
    }
  }, [initialAction]);

  const selectedVault = useMemo(
    () =>
      vaults.find(
        (vault) =>
          vaultAddress &&
          vault.vaultAddress.toLowerCase() === vaultAddress.toLowerCase(),
      ) ?? null,
    [vaultAddress, vaults],
  );

  const topApy = useMemo(() => {
    const rates = vaults
      .map((vault) => vault.currentApy)
      .filter((rate): rate is number => typeof rate === "number");
    return rates.length > 0 ? Math.max(...rates) : null;
  }, [vaults]);

  function handleSelectVault(nextAddress: string) {
    selectVault(nextAddress);
    setTab("deposit");
  }

  const walletLabel =
    earnWallet.kind === "circle"
      ? "SwiftPay wallet"
      : earnWallet.kind === "external"
        ? "Connected wallet"
        : null;

  const isPanelTab =
    tab === "deposit" || tab === "withdraw" || tab === "automate";

  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Put your idle USDC to work while keeping your funds accessible."
        title="Earn"
      >
        <div className="earn-page">
          <section className="earn-headline">
            <div className="earn-headline-main">
              <p className="earn-kicker">Earn on idle USDC</p>
              <h2 className="earn-headline-title">
                {selectedVault ? vaultName(selectedVault) : "Choose a vault"}
              </h2>
              <p className="earn-headline-sub">
                Withdraw any time. No lock-up, no notice period.
              </p>
            </div>
            <div className="earn-headline-stats">
              <div className="earn-headline-stat">
                <span className="earn-headline-stat-label">
                  {selectedVault ? "Selected APY" : "Best APY"}
                </span>
                <span className="earn-headline-stat-value">
                  {formatApy(selectedVault?.currentApy ?? topApy) ?? "—"}
                </span>
              </div>
              <div className="earn-headline-stat">
                <span className="earn-headline-stat-label">Vaults</span>
                <span className="earn-headline-stat-value">
                  {loading ? "…" : vaults.length}
                </span>
              </div>
              {walletLabel ? (
                <div className="earn-headline-stat">
                  <span className="earn-headline-stat-label">Wallet</span>
                  <span className="earn-headline-stat-value earn-headline-stat-sm">
                    {walletLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          {!isConnected ? (
            <div className="earn-connect-hint">
              <Wallet className="h-5 w-5" />
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>Connect a wallet to deposit, view your position, or withdraw.</p>
                <WalletConnectButton />
              </div>
            </div>
          ) : null}

          <div aria-label="Earn" className="earn-tabs" role="tablist">
            {tabs.map((item) => {
              const active = tab === item.id;
              const Icon = item.icon;
              return (
                <button
                  aria-selected={active}
                  className={cn("earn-tab", active && "is-active")}
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  role="tab"
                  type="button"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.id === "automate" ? (
                    <span className="earn-tab-badge">Premium</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab === "vaults" ? (
            <EarnVaultList
              error={error}
              loading={loading}
              onSelect={handleSelectVault}
              selectedVaultAddress={vaultAddress}
              vaults={vaults}
            />
          ) : null}

          {tab === "position" ? (
            <EarnPosition
              connectedAddress={earnWallet.address ?? address}
              currentChainId={earnWallet.currentChainId}
              resolveProvider={earnWallet.resolveProvider}
              selectedVault={selectedVault}
              vaultAddress={vaultAddress}
            />
          ) : null}

          {isPanelTab ? (
            <article className="earn-balance-card">
              <div className="earn-balance-header">
                <span>{PANEL_TITLES[tab]}</span>
                {selectedVault ? (
                  <span className="earn-balance-header-note">
                    {vaultName(selectedVault)}
                  </span>
                ) : null}
              </div>

              {tab === "deposit" ? (
                <EarnDeposit
                  connectedAddress={earnWallet.address ?? address}
                  currentChainId={earnWallet.currentChainId}
                  initialAmount={initialAction === "deposit" ? initialAmount : undefined}
                  resolveProvider={earnWallet.resolveProvider}
                  selectedVault={selectedVault}
                  switchChainAsync={earnWallet.switchChainAsync}
                  vaultAddress={vaultAddress}
                  walletReason={earnWallet.reason}
                />
              ) : null}

              {tab === "withdraw" ? (
                <EarnWithdraw
                  connectedAddress={earnWallet.address ?? address}
                  currentChainId={earnWallet.currentChainId}
                  initialAmount={initialAction === "withdraw" ? initialAmount : undefined}
                  resolveProvider={earnWallet.resolveProvider}
                  selectedVault={selectedVault}
                  switchChainAsync={earnWallet.switchChainAsync}
                  vaultAddress={vaultAddress}
                  walletReason={earnWallet.reason}
                />
              ) : null}

              {tab === "automate" ? (
                <AutoDepositPanel
                  circleSocialUuid={circleSocialUuid}
                  vaultAddress={vaultAddress}
                  walletAddress={earnWallet.address ?? address}
                />
              ) : null}
            </article>
          ) : null}
        </div>
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
