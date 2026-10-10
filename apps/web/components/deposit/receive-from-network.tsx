"use client";

import { AlertTriangle, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IncomingDeposits } from "@/components/deposit/incoming-deposits";
import { LazyQRCodeSVG } from "@/components/lazy-qr-code";
import { NetworkPicker } from "@/components/send/network-picker";
import { arcChain } from "@/lib/chains";
import {
  fetchMultichainOverview,
  refreshIncomingDeposits,
  requestDepositAddress,
  type MultichainOverview,
} from "@/lib/multichain/client";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { cn } from "@/lib/utils";

import "./multichain.css";

/** How often an open receive screen checks for arrivals. */
const POLL_MS = 20_000;

/**
 * Receive USDC sent on another network. Each network has its own address; what
 * lands there moves to the Arc balance by itself.
 */
export function ReceiveFromNetwork() {
  const { address: ownerWallet } = usePlatformWallet();
  const [overview, setOverview] = useState<MultichainOverview | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!ownerWallet) return;
    let cancelled = false;
    fetchMultichainOverview(ownerWallet)
      .then((next) => {
        if (cancelled) return;
        setOverview(next);
        setNetwork((current) => current ?? next.chains[0]?.key ?? null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load networks.");
      });
    return () => {
      cancelled = true;
    };
  }, [ownerWallet]);

  const chain = overview?.chains.find((entry) => entry.key === network) ?? null;
  const address = overview?.addresses.find((entry) => entry.network === network)?.address ?? null;
  const minByNetwork = useMemo(
    () => Object.fromEntries((overview?.chains ?? []).map((entry) => [entry.key, entry.minDeposit])),
    [overview],
  );

  // First visit to a network creates its address.
  useEffect(() => {
    if (!ownerWallet || !overview?.enabled || !network || address || creating) return;
    let cancelled = false;
    setCreating(true);
    setError(null);
    requestDepositAddress(ownerWallet, network)
      .then((created) => {
        if (cancelled) return;
        setOverview((current) =>
          current
            ? {
                ...current,
                addresses: [
                  ...current.addresses.filter((entry) => entry.network !== created.network),
                  { address: created.address, network: created.network },
                ],
              }
            : current,
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not create the address.");
      })
      .finally(() => {
        if (!cancelled) setCreating(false);
      });
    return () => {
      cancelled = true;
    };
    // `creating` is left out on purpose: it is set here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerWallet, overview?.enabled, network, address]);

  const checkNow = useCallback(async () => {
    if (!ownerWallet || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      setOverview(await refreshIncomingDeposits(ownerWallet));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check for deposits.");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [ownerWallet]);

  // While the screen is open and visible, look for arrivals on a timer.
  const hasAddresses = (overview?.addresses.length ?? 0) > 0;
  useEffect(() => {
    if (!overview?.enabled || !hasAddresses) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkNow();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [overview?.enabled, hasAddresses, checkNow]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  if (!ownerWallet) {
    return <p className="mc-note">Sign in to get your deposit addresses.</p>;
  }

  if (overview && !overview.enabled) {
    return <p className="mc-note">Receiving from other networks is not available on this account yet.</p>;
  }

  return (
    <div className="mc-receive">
      <NetworkPicker
        chains={overview?.chains ?? []}
        description="Each network has its own address. What lands there moves to your balance by itself."
        detail={(entry) => `Min ${entry.minDeposit} USDC · ${entry.typicalWait}`}
        onChange={(entry) => {
          setNetwork(entry.key);
          setError(null);
        }}
        value={chain}
      />

      <section className="mc-card">
        {!overview || (creating && !address) ? (
          <div className="mc-loading">
            <Loader2 className="h-5 w-5 animate-spin" />
            {overview ? `Creating your ${chain?.name ?? ""} address…` : "Loading networks…"}
          </div>
        ) : address && chain ? (
          <>
            <p className="mc-card-label">Your {chain.name} address</p>
            <div className="mc-qr">
              <LazyQRCodeSVG
                bgColor="#ffffff"
                fgColor="#160f24"
                marginSize={1}
                size={168}
                title={`${chain.name} deposit address`}
                value={address}
              />
            </div>
            <button className="mc-address" onClick={() => void copyAddress()} type="button">
              <span>{address}</span>
              {copied ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Copy className="h-4 w-4 shrink-0" />}
            </button>
            <ul className="mc-facts">
              <li>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Send <strong>USDC on {chain.name} only</strong>. Other tokens or networks sent here are not
                  credited.
                </span>
              </li>
              <li>
                Minimum {chain.minDeposit} USDC. Smaller amounts wait here until the total reaches it.
              </li>
              <li>
                Lands in your {arcChain.name} balance in {chain.typicalWait}. Circle&apos;s network fee (about 2
                cents) comes off the amount.
              </li>
            </ul>
          </>
        ) : (
          <p className="mc-note">Pick a network to see its address.</p>
        )}
      </section>

      {error ? <p className="mc-error">{error}</p> : null}

      <div className="mc-arriving-head">
        <h2 className="dep-section-title">Incoming</h2>
        <button className="mc-check" disabled={checking || !hasAddresses} onClick={() => void checkNow()} type="button">
          <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
          Check now
        </button>
      </div>
      {overview && overview.deposits.length > 0 ? (
        <IncomingDeposits deposits={overview.deposits} minDepositByNetwork={minByNetwork} />
      ) : (
        <p className="mc-note">Nothing yet. Transfers show here as soon as their network sees them.</p>
      )}
    </div>
  );
}
