"use client";

import { ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useConfig, useReadContract, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { formatMoney, moneyNumber } from "@/lib/account/money";
import {
  payPublicCharge,
  registerChargeIntentClient,
  reportChargeSettled,
} from "@/lib/checkout/client";
import type { PublicChargePayload } from "@/lib/checkout/types";
import { erc20Abi } from "@/lib/contracts";
import {
  DEPOSIT_SOURCE_CHAINS,
  DEPOSIT_STEPS,
  DEPOSIT_STEP_LABELS,
  DepositIncompleteError,
  DepositRejectedError,
  bridgeUsdcToArc,
  depositSourceByChainId,
  getDepositErrorMessage,
  type DepositStep,
} from "@/lib/deposit-to-arc";
import { onchainFacts } from "@/lib/onchain-facts";
import { formatUsdcDisplay, tryParseUsdc } from "@/lib/onchain-money";
import { cn } from "@/lib/utils";

const fallbackAddress = "0x0000000000000000000000000000000000000000" as const;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pay a USDC charge with USDC held on another chain: App Kit burns it there
 * and Circle mints it on Arc straight into the business wallet. When the mint
 * hash comes back the payment confirms by receipt; otherwise the server's
 * matcher picks it up when the mint lands.
 */
export function PayWithBridge({
  payload,
  total,
  onUpdate,
}: {
  payload: PublicChargePayload;
  total: string;
  onUpdate: (next: PublicChargePayload) => void;
}) {
  const { charge, destinationWallet, business } = payload;
  const { address, chainId: walletChainId, connector, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { chains: configuredChains } = useConfig();

  // Only chains this build's wallet config can switch to.
  const sources = useMemo(() => {
    const configured = new Set(configuredChains.map((chain) => chain.id));
    return DEPOSIT_SOURCE_CHAINS.filter((chain) => configured.has(chain.chainId));
  }, [configuredChains]);
  const [sourceChainId, setSourceChainId] = useState<number | null>(null);
  const source = useMemo(() => {
    const chosen =
      (sourceChainId === null ? null : depositSourceByChainId(sourceChainId)) ??
      (walletChainId ? depositSourceByChainId(walletChainId) : undefined) ??
      sources[0];
    return chosen && sources.includes(chosen) ? chosen : (sources[0] ?? null);
  }, [sourceChainId, sources, walletChainId]);

  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<DepositStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeFrom, setResumeFrom] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<{ pending: boolean; explorerUrl: string } | null>(null);

  const { data: sourceBalance } = useReadContract({
    abi: erc20Abi,
    address: source?.usdcAddress ?? fallbackAddress,
    args: [address ?? fallbackAddress],
    chainId: source?.chainId,
    functionName: "balanceOf",
    query: { enabled: Boolean(address && source) },
  });
  const totalUnits = tryParseUsdc(total);
  const balanceUnits = typeof sourceBalance === "bigint" ? sourceBalance : undefined;
  const shortOfFunds =
    totalUnits !== null && balanceUnits !== undefined && totalUnits > balanceUnits;

  async function pay() {
    if (!connector || !address || !source || moneyNumber(total) <= 0 || busy) return;
    setBusy(true);
    setError(null);
    const resuming = resumeFrom;
    let leftArc = false;
    try {
      if (!resuming) {
        // Keeps the charge open long enough for a slow attestation, and
        // marks it for the matcher in case the mint hash never comes back.
        await registerChargeIntentClient(charge.code, { method: "BRIDGE", payerWallet: address });
      }
      if (walletChainId !== source.chainId) {
        await switchChainAsync({ chainId: source.chainId });
        leftArc = true;
      }
      const provider = await connector.getProvider();
      const result = await bridgeUsdcToArc({
        amount: total,
        onStep: (next) =>
          setStep((current) =>
            current !== null && DEPOSIT_STEPS.indexOf(next) < DEPOSIT_STEPS.indexOf(current)
              ? current
              : next,
          ),
        provider,
        recipientAddress: getAddress(destinationWallet),
        resumeFrom: resuming ?? undefined,
        source,
      });
      setResumeFrom(null);
      setOutcome({ explorerUrl: result.explorerUrl, pending: result.pending });

      if (!result.pending && result.txHash) {
        // The Arc mint hash: confirm by receipt, retrying while it propagates.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            onUpdate(await payPublicCharge(charge.code, { txHash: result.txHash, via: "BRIDGE" }));
            return;
          } catch {
            await wait(2000 * (attempt + 1));
          }
        }
      }
      // No Arc hash yet (or it wouldn't confirm): the matcher takes it from here.
      onUpdate(
        await reportChargeSettled(charge.code, {
          reference: result.txHash || undefined,
          tokenSymbol: "USDC",
        }),
      );
    } catch (cause) {
      if (cause instanceof DepositRejectedError) {
        setStep(null);
        setError("You cancelled in your wallet. Nothing was sent.");
      } else if (cause instanceof DepositIncompleteError) {
        // Never restart: the burn may already be on chain.
        setResumeFrom(cause.canResume ? cause.result : null);
        setError(cause.message);
      } else {
        setError(
          cause instanceof Error
            ? getDepositErrorMessage(cause.message.split("\n")[0] || cause.message)
            : "The payment could not be completed.",
        );
      }
    } finally {
      setBusy(false);
      // Land the wallet back on Arc so the rest of the page keeps working.
      if (leftArc) {
        try {
          await switchChainAsync({ chainId: onchainFacts.chainId });
        } catch {
          // Still on the source chain; the payment itself is unaffected.
        }
      }
    }
  }

  if (charge.currency !== "USDC") {
    return (
      <p className="text-sm text-muted-foreground">
        Paying from another chain works for USDC charges only.
      </p>
    );
  }

  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">No other chains are available right now.</p>;
  }

  if (outcome) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            {outcome.pending
              ? `Sent from ${source?.name ?? "the other chain"}. Circle delivers it to ${business.name} on Arc once the transfer is attested, which can take a few minutes. This page updates when it lands, and you can close it.`
              : `Delivered to ${business.name} on Arc. Confirming…`}
          </p>
        </div>
        {outcome.explorerUrl ? (
          <a
            className="inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary hover:underline"
            href={outcome.explorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            View transaction
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Pay from
        <select
          className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          disabled={busy}
          onChange={(event) => setSourceChainId(Number(event.target.value))}
          value={source?.chainId ?? ""}
        >
          {sources.map((chain) => (
            <option key={chain.chainId} value={chain.chainId}>
              {chain.name}
            </option>
          ))}
        </select>
      </label>

      {isConnected && balanceUnits !== undefined ? (
        <p className={cn("text-sm", shortOfFunds ? "text-destructive" : "text-muted-foreground")}>
          {formatUsdcDisplay(balanceUnits)} USDC on {source?.name}
          {shortOfFunds ? ": not enough for this payment." : ""}
        </p>
      ) : null}

      {step ? (
        <ol className="space-y-1 text-sm">
          {DEPOSIT_STEPS.map((name) => {
            const index = DEPOSIT_STEPS.indexOf(name);
            const current = DEPOSIT_STEPS.indexOf(step);
            return (
              <li
                className={cn(
                  "flex items-center gap-2",
                  index < current ? "text-foreground" : index === current ? "font-medium" : "text-muted-foreground",
                )}
                key={name}
              >
                {index < current ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : index === current && busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border border-border" />
                )}
                {DEPOSIT_STEP_LABELS[name]}
              </li>
            );
          })}
        </ol>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!isConnected ? (
        <WalletConnectButton fullWidth />
      ) : (
        <Button
          className="h-12 w-full text-base"
          disabled={busy || shortOfFunds || !source}
          onClick={() => void pay()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {resumeFrom
            ? "Resume payment"
            : `Pay ${formatMoney(total, charge.currency)} from ${source?.name ?? "another chain"}`}
        </Button>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Uses Circle&rsquo;s cross-chain transfer. You approve and send on {source?.name}, and pay
        that chain&rsquo;s gas. A small delivery fee may be taken on Arc; if it leaves the charge
        short, the rest can be paid from any wallet.
      </p>
    </div>
  );
}
