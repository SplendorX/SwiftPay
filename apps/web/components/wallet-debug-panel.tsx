"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { arcChain } from "@/lib/chains";

/**
 * Wallet diagnostics for phones, where there is no console to read.
 * Hidden unless the page is opened with ?walletdebug=1 (remembered for the
 * tab). Shows the connected wallet, the network SwiftPay believes it is on
 * next to what the wallet reports, the networks the WalletConnect session
 * approved, and every request sent to the wallet with its outcome.
 */

type Line = { at: string; text: string };

type WalletConnectProvider = {
  request?: (args: { method: string; params?: unknown }) => Promise<unknown>;
  session?: {
    namespaces?: Record<string, { chains?: string[]; accounts?: string[] }>;
    peer?: { metadata?: { name?: string; redirect?: { native?: string; universal?: string } } };
  };
  signer?: { client?: { events?: { on: (e: string, l: (p: unknown) => void) => void } } };
};

const flagKey = "swiftpay.walletdebug";

function enabled() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("walletdebug") === "1") {
      window.sessionStorage.setItem(flagKey, "1");
    }
    return window.sessionStorage.getItem(flagKey) === "1";
  } catch {
    return false;
  }
}

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

export function WalletDebugPanel() {
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [info, setInfo] = useState<Record<string, string>>({});
  const { chainId, connector, status, address } = useAccount();
  const hooked = useRef<unknown>(null);

  const log = (text: string) =>
    setLines((prev) => [{ at: stamp(), text }, ...prev].slice(0, 40));

  useEffect(() => setOn(enabled()), []);

  // Messages from wallet code (e.g. the OKX link being built on tap), and
  // where the page navigates to open a wallet.
  useEffect(() => {
    if (!on) return;
    const onDebug = (event: Event) => log(String((event as CustomEvent).detail));
    const onHide = () => log(`page hidden (${document.visibilityState}) — a wallet app probably opened`);
    const onShow = () => { if (document.visibilityState === "visible") log("page visible again"); };
    window.addEventListener("swiftpay:walletdebug", onDebug);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onShow);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide(); });
    return () => {
      window.removeEventListener("swiftpay:walletdebug", onDebug);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [on]);

  // Errors and unhandled rejections, which otherwise vanish on a phone.
  useEffect(() => {
    if (!on) return;
    const onError = (event: ErrorEvent) => log(`error: ${event.message}`);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { shortMessage?: string; message?: string } | undefined;
      log(`rejected: ${reason?.shortMessage ?? reason?.message ?? String(event.reason)}`.slice(0, 300));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [on]);

  useEffect(() => {
    if (!on) return;
    log(`wagmi: status=${status} chainId=${chainId ?? "-"} connector=${connector?.id ?? "-"} (${connector?.type ?? "-"})`);
  }, [on, status, chainId, connector]);

  useEffect(() => {
    if (!on || !connector || status !== "connected") return;
    let stopped = false;

    const refresh = async () => {
      const provider = (await connector.getProvider().catch(() => undefined)) as
        | WalletConnectProvider
        | undefined;
      if (stopped || !provider) return;
      let walletChain = "?";
      try {
        const raw = await provider.request?.({ method: "eth_chainId" });
        walletChain = String(typeof raw === "string" && raw.startsWith("0x") ? Number.parseInt(raw, 16) : raw);
      } catch (error) {
        walletChain = `error: ${(error as Error)?.message ?? error}`.slice(0, 80);
      }
      const approved = Object.values(provider.session?.namespaces ?? {})
        .flatMap((ns) => ns.chains ?? [])
        .join(", ");
      setInfo({
        wallet: provider.session?.peer?.metadata?.name ?? connector.name,
        "app link": provider.session?.peer?.metadata?.redirect?.native ?? "-",
        "SwiftPay thinks chain": String(chainId ?? "-"),
        "wallet reports chain": walletChain,
        "Arc chain id": String(arcChain.id),
        "session approved chains": approved || "(not WalletConnect)",
        "Arc approved in session": approved ? String(approved.includes(`eip155:${arcChain.id}`)) : "n/a",
        account: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "-",
      });

      // Log every request sent to the wallet, once per provider.
      if (hooked.current !== provider && provider.request) {
        hooked.current = provider;
        const original = provider.request.bind(provider);
        provider.request = async (args) => {
          const quiet = /^eth_(chainId|accounts|blockNumber|getBalance|call|estimateGas|getTransaction|gasPrice|feeHistory|getBlock)/.test(args.method);
          if (!quiet) log(`→ ${args.method}`);
          try {
            const result = await original(args);
            if (!quiet) log(`✓ ${args.method}`);
            return result;
          } catch (error) {
            const e = error as { code?: number; shortMessage?: string; message?: string };
            log(`✗ ${args.method}: ${e.code ?? ""} ${e.shortMessage ?? e.message ?? error}`.slice(0, 300));
            throw error;
          }
        };
        provider.signer?.client?.events?.on("session_request_sent", (payload) => {
          const p = payload as { request?: { method?: string }; chainId?: string };
          log(`sent to wallet: ${p.request?.method ?? "?"} on ${p.chainId ?? "?"}`);
        });
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [on, connector, status, chainId, address]);

  if (!on) return null;

  return (
    <div
      style={{
        position: "fixed", left: 8, right: 8, bottom: 8, zIndex: 2147483647,
        maxHeight: "45vh", overflow: "auto", background: "rgba(10,12,18,0.94)",
        color: "#e6edf3", font: "11px/1.4 ui-monospace, Consolas, monospace",
        borderRadius: 10, padding: 10, border: "1px solid #30363d",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <b>Wallet diagnostics</b>
        <button
          onClick={() => {
            try { window.sessionStorage.removeItem(flagKey); } catch {}
            setOn(false);
          }}
          style={{ color: "#79c0ff", background: "none", border: 0, font: "inherit" }}
          type="button"
        >
          close
        </button>
      </div>
      {Object.entries(info).map(([k, v]) => (
        <div key={k}><span style={{ color: "#8b949e" }}>{k}:</span> {v}</div>
      ))}
      <div style={{ borderTop: "1px solid #30363d", margin: "6px 0" }} />
      {lines.map((l, i) => (
        <div key={i}><span style={{ color: "#6e7681" }}>{l.at}</span> {l.text}</div>
      ))}
    </div>
  );
}
