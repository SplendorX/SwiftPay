"use client";

import { AlertTriangle, ArrowUpRight, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { erc20Abi as viemErc20Abi, formatUnits, getAddress, parseUnits } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { formatMoney, moneyNumber } from "@/lib/account/money";
import { switchToArc } from "@/lib/arc-network";
import { arcChain } from "@/lib/chains";
import { showSuccess } from "@/components/success-popup";
import { payPublicCharge, registerChargeIntentClient } from "@/lib/checkout/client";
import type { PublicChargePayload } from "@/lib/checkout/types";
import { erc20Abi } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/onchain-facts";
import { recordPlatformTransactionActivity } from "@/lib/referral/activity-client";
import { arcTokens } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { fetchWalletSessionForAddress } from "@/lib/wallet-auth-client";

/**
 * Where a payment is. `recording` can outlive a reload: the hash is kept so a
 * payment that landed on chain is never asked for twice.
 */
type Phase = "idle" | "switching" | "intent" | "signing" | "confirming" | "recording";

const pendingKey = (code: string) => `saphra:charge-payment:${code}`;

function readPending(code: string) {
  try {
    const raw = sessionStorage.getItem(pendingKey(code));
    return raw ? (JSON.parse(raw) as { hash: `0x${string}`; amount: string }) : null;
  } catch {
    return null;
  }
}

function writePending(code: string, value: { hash: string; amount: string } | null) {
  try {
    if (value) sessionStorage.setItem(pendingKey(code), JSON.stringify(value));
    else sessionStorage.removeItem(pendingKey(code));
  } catch {
    // Private mode: recovery just won't survive a reload.
  }
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pay a charge from any wallet on Arc: a plain token transfer, no platform fee. */
export function PayWithWallet({
  payload,
  total,
  onSettled,
}: {
  payload: PublicChargePayload;
  total: string;
  onSettled: (next: PublicChargePayload, txHash: string) => void;
}) {
  const { charge, destinationWallet, business } = payload;
  const code = charge.code;
  const token = arcTokens[charge.currency];
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: arcChain.id });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ hash: `0x${string}`; amount: string } | null>(null);

  useEffect(() => {
    setPending(readPending(code));
  }, [code]);

  const { data: balanceUnits } = useReadContract({
    abi: viemErc20Abi,
    address: token.address,
    args: address ? [address] : undefined,
    chainId: arcChain.id,
    functionName: "balanceOf",
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  /** Retries while the server's RPC catches up with the block the wallet saw. */
  const record = useCallback(
    async (hash: `0x${string}`) => {
      setPhase("recording");
      setError(null);
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const next = await payPublicCharge(code, { payerWallet: address, txHash: hash });
          writePending(code, null);
          setPending(null);
          setPhase("idle");
          onSettled(next, hash);
          return true;
        } catch (err) {
          lastError = err;
          await wait(1500 * (attempt + 1));
        }
      }
      setError(
        lastError instanceof Error
          ? `Your payment went through on Arc, but we couldn't record it yet: ${lastError.message}`
          : "Your payment went through on Arc, but we couldn't record it yet.",
      );
      setPhase("idle");
      return false;
    },
    [address, code, onSettled],
  );

  const amountValue = moneyNumber(total);
  const wrongNetwork = isConnected && chainId !== arcChain.id;
  const balance =
    typeof balanceUnits === "bigint" ? Number(formatUnits(balanceUnits, token.decimals)) : null;
  const shortOfFunds = balance !== null && amountValue > balance + 0.000001;
  const busy = phase !== "idle";

  async function pay() {
    if (!address || amountValue <= 0) return;
    setError(null);
    try {
      if (wrongNetwork) {
        setPhase("switching");
        await switchToArc(switchChainAsync);
      }
      // Tells the merchant screen a wallet payment is on its way, and refuses
      // early if the charge was paid or cancelled meanwhile.
      setPhase("intent");
      await registerChargeIntentClient(code, { method: "WALLET", payerWallet: address });

      setPhase("signing");
      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: token.address,
        args: [getAddress(destinationWallet), parseUnits(total, token.decimals)],
        chainId: arcChain.id,
        functionName: "transfer",
      });

      // From here the money has moved: keep the hash so nothing is lost.
      writePending(code, { amount: total, hash });
      setPending({ amount: total, hash });
      setPhase("confirming");
      await publicClient?.waitForTransactionReceipt({ hash });

      const recorded = await record(hash);
      if (recorded) {
        showSuccess({
          amount: `${total} ${charge.currency}`,
          eyebrow: "Checkout",
          explorerUrl: `${arcChain.blockExplorers.default.url}/tx/${hash}`,
          rows: [{ label: "To", value: business.name }],
          subtitle: `Paid ${business.name}.`,
          title: "Payment successful",
        });
      }

      // The activity label only applies to someone already signed in to
      // SaphraONE with this wallet. A guest payer is never contacted,
      // registered or remembered.
      if (recorded) {
        const session = await fetchWalletSessionForAddress(address).catch(() => null);
        if (session?.authenticated) {
          void recordPlatformTransactionActivity({
            activity: {
              counterparty: business.name,
              source: "checkout",
              title: `Paid ${business.name}`,
            },
            activityType: "TRANSFER",
            amount: total,
            showToast: false,
            token: charge.currency,
            txHash: hash,
            walletAddress: address,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment could not be completed.";
      setError(
        /reject|denied|cancel/i.test(message)
          ? "You cancelled the payment in your wallet. Nothing was sent."
          : message.split("\n")[0],
      );
      setPhase("idle");
    }
  }

  const label =
    phase === "switching"
      ? "Switching to Arc…"
      : phase === "intent"
        ? "Getting ready…"
        : phase === "signing"
          ? "Confirm in your wallet…"
          : phase === "confirming"
            ? "Confirming on Arc…"
            : phase === "recording"
              ? "Recording payment…"
              : wrongNetwork
                ? "Switch to Arc and pay"
                : `Pay ${formatMoney(total, charge.currency)}`;

  if (pending) {
    // The transfer landed but isn't recorded: never offer to pay again.
    return (
      <div className="space-y-3">
        <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {busy ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          )}
          <p>
            {phase === "confirming"
              ? "Waiting for Arc to confirm your payment…"
              : phase === "recording"
                ? "Payment sent. Letting the business know…"
                : (error ?? "Your payment was sent. Finish recording it.")}
          </p>
        </div>
        <Button className="h-11 w-full" disabled={busy} onClick={() => void record(pending.hash)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? label : "Finish recording payment"}
        </Button>
        <a
          className="inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
          href={explorerTxUrl(pending.hash)}
          rel="noreferrer"
          target="_blank"
        >
          View transaction
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isConnected && address ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            {shortAddress(address)}
          </span>
          <span
            className={cn("tabular-nums", shortOfFunds ? "text-destructive" : "text-muted-foreground")}
          >
            {wrongNetwork ? "Not on Arc" : balance === null ? "…" : formatMoney(balance, charge.currency)}
          </span>
        </div>
      ) : null}
      {shortOfFunds && !wrongNetwork ? (
        <p className="text-sm text-destructive">
          This wallet doesn&rsquo;t hold enough {charge.currency} on Arc for this payment.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!isConnected ? (
        <WalletConnectButton fullWidth />
      ) : (
        <Button
          className="h-12 w-full text-base"
          disabled={busy || amountValue <= 0 || (shortOfFunds && !wrongNetwork)}
          onClick={() => void pay()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {label}
        </Button>
      )}

      <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        Pay from any wallet on Arc. No SaphraONE account needed, and paying doesn&rsquo;t sign you up
        or save your wallet. The money goes straight to {business.name}.
      </p>
    </div>
  );
}
