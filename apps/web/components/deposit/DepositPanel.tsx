"use client";

import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { type Address } from "viem";
import {
  useAccount,
  useBalance,
  useConfig,
  useReadContract,
  useSwitchChain,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { showSuccess } from "@/components/success-popup";
import { erc20Abi } from "@/lib/contracts";
import {
  bridgeUsdcToArc,
  DEPOSIT_SOURCE_CHAINS,
  DEPOSIT_STEP_LABELS,
  DepositIncompleteError,
  DEPOSIT_STEPS,
  depositSourceByChainId,
  DepositRejectedError,
  getDepositErrorMessage,
  type DepositStep,
} from "@/lib/deposit-to-arc";
import {
  formatUsdc,
  formatUsdcDisplay,
  isValidUsdcAmount,
  tryParseUsdc,
} from "@/lib/onchain-money";
import { multichainEnabled } from "@/lib/multichain/flag";
import { onchainFacts } from "@/lib/onchain-facts";
import { usePlatformWallet } from "@/lib/use-platform-wallet";

const fallbackAddress = "0x0000000000000000000000000000000000000000" as Address;
const zeroAmount = BigInt(0);

function shortenAddress(value?: string) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function DepositPanel() {
  const {
    address: externalAddress,
    chainId: walletChainId,
    connector,
    isConnected,
  } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { address: platformAddress, source: walletSource } =
    usePlatformWallet();
  const { chains: configuredChains } = useConfig();

  // Only offer sources this build can actually switch the wallet to. Arc
  // mainnet drops the testnet chains from the wagmi config, so the list
  // narrows itself instead of failing at `switchChain` time.
  const sources = useMemo(() => {
    const configured = new Set(configuredChains.map((chain) => chain.id));
    return DEPOSIT_SOURCE_CHAINS.filter((chain) => configured.has(chain.chainId));
  }, [configuredChains]);

  const [sourceChainId, setSourceChainId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<DepositStep | null>(null);
  const [settled, setSettled] = useState<"complete" | "pending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  // Set when a bridge stopped partway and App Kit can pick it back up.
  const [resumeFrom, setResumeFrom] = useState<unknown>(null);

  const source = useMemo(() => {
    if (sources.length === 0) return null;
    const chosen =
      (sourceChainId === null ? null : depositSourceByChainId(sourceChainId)) ??
      (walletChainId ? depositSourceByChainId(walletChainId) : undefined) ??
      sources[0];
    return sources.includes(chosen) ? chosen : sources[0];
  }, [sourceChainId, sources, walletChainId]);

  const recipient = platformAddress ?? externalAddress;
  // A Google session holds a Circle wallet that exists on Arc only, so it can
  // never be the *source* of a bridge — but it is a perfectly good destination.
  const hasPlatformWallet = Boolean(platformAddress);
  const recipientIsPlatform = Boolean(
    platformAddress &&
      (!externalAddress ||
        platformAddress.toLowerCase() !== externalAddress.toLowerCase()),
  );

  const { data: sourceBalance, refetch: refetchSource } = useReadContract({
    abi: erc20Abi,
    address: source?.usdcAddress ?? fallbackAddress,
    args: [externalAddress ?? fallbackAddress],
    chainId: source?.chainId,
    functionName: "balanceOf",
    query: { enabled: Boolean(externalAddress && source) },
  });

  const { data: sourceGas } = useBalance({
    address: externalAddress,
    chainId: source?.chainId,
    query: { enabled: Boolean(externalAddress && source) },
  });

  const { data: arcBalance, refetch: refetchArc } = useReadContract({
    abi: erc20Abi,
    address: onchainFacts.usdcAddress ?? fallbackAddress,
    args: [recipient ?? fallbackAddress],
    chainId: onchainFacts.chainId,
    functionName: "balanceOf",
    query: { enabled: Boolean(recipient && onchainFacts.usdcAddress) },
  });

  const amountValid = isValidUsdcAmount(amount);
  const amountUnits = tryParseUsdc(amount);
  const balanceUnits =
    typeof sourceBalance === "bigint" ? sourceBalance : undefined;
  const overBalance =
    amountUnits !== null &&
    balanceUnits !== undefined &&
    amountUnits > balanceUnits;
  const noGas = sourceGas !== undefined && sourceGas.value === zeroAmount;

  const balanceLabel =
    balanceUnits !== undefined
      ? `${formatUsdcDisplay(balanceUnits)} USDC`
      : isConnected
        ? "Loading…"
        : "Connect wallet";

  const canSubmit = Boolean(
    isConnected &&
      connector &&
      source &&
      recipient &&
      amountValid &&
      !overBalance &&
      !busy &&
      !isSwitching,
  );

  function resetOutcome() {
    setError(null);
    setResultUrl(null);
    setStep(null);
    setSettled(null);
    setResumeFrom(null);
  }

  async function handleBridge() {
    if (!connector || !externalAddress || !source || !recipient) return;
    if (!amountValid || overBalance || busy) return;

    setBusy(true);
    const resuming = resumeFrom;
    if (resuming) {
      setError(null);
    } else {
      resetOutcome();
    }
    const deposited = amount;
    let leftArc = false;

    try {
      if (walletChainId !== source.chainId) {
        await switchChainAsync({ chainId: source.chainId });
        leftArc = true;
      }
      const provider = await connector.getProvider();
      const result = await bridgeUsdcToArc({
        amount: deposited,
        // Providers can re-emit an earlier stage (a re-attest, say). Only ever
        // advance, so the progress list cannot walk backwards.
        onStep: (next) =>
          setStep((current) =>
            current !== null &&
            DEPOSIT_STEPS.indexOf(next) < DEPOSIT_STEPS.indexOf(current)
              ? current
              : next,
          ),
        provider,
        recipientAddress: recipient,
        resumeFrom: resuming ?? undefined,
        source,
      });

      setResumeFrom(null);

      setResultUrl(result.explorerUrl);
      setSettled(result.pending ? "pending" : "complete");
      if (!result.pending) setStep("mint");
      showSuccess({
        amount: `${result.amount} USDC`,
        explorerUrl: result.explorerUrl,
        eyebrow: "Deposit",
        rows: [
          { label: "From", value: source.name },
          { label: "To", value: onchainFacts.chain.name },
          { label: "Recipient", value: shortenAddress(result.recipientAddress) },
        ],
        subtitle: result.pending
          ? `Burned on ${source.name}. Circle mints on ${onchainFacts.chain.name} once the attestation lands.`
          : `${result.amount} USDC arrived on ${onchainFacts.chain.name}.`,
        title: result.pending ? "Deposit on its way" : "Deposit complete",
      });
      setAmount("");
    } catch (cause) {
      if (cause instanceof DepositRejectedError) {
        setStep(null);
      } else if (cause instanceof DepositIncompleteError) {
        // Never restart: the burn may already be on chain. Offer a resume so
        // App Kit continues from the last step that succeeded.
        setResumeFrom(cause.canResume ? cause.result : null);
        setError(cause.message);
      } else {
        setError(
          cause instanceof Error
            ? getDepositErrorMessage(cause.message.split("\n")[0] || cause.message)
            : "Deposit to Arc failed.",
        );
      }
    } finally {
      setBusy(false);
      // Land the wallet back on Arc, success or not, so the rest of SaphraONE
      // keeps working. Only when this deposit moved it — otherwise a declined
      // switch would be answered with a second, pointless prompt.
      if (leftArc) {
        try {
          await switchChainAsync({ chainId: onchainFacts.chainId });
        } catch {
          // Still on the source chain; the deposit itself is unaffected.
        }
      }
      await Promise.allSettled([refetchSource(), refetchArc()]);
    }
  }

  // Bridging is closed to Google sign-ins, and the server-signed route cannot
  // rescue it: a Circle wallet here is user-controlled (ENDUSER custody) and
  // lives on Arc only, so the developer-controlled adapter can neither sign for
  // it nor find USDC to burn on a source chain. Saying so once is kinder than a
  // form that always ends in "cannot find target wallet".
  if (walletSource === "embedded") {
    return (
      <section className="section-panel">
        <p className="section-eyebrow">Deposit to Arc</p>
        <h2 className="section-title">
          Bridging is not available on a Google account
        </h2>
        <p className="section-copy">
          Your SaphraONE wallet lives on {onchainFacts.chain.name} only. Bridging
          burns USDC on the network it is coming from, and that needs a wallet
          that holds it there — so this route is closed on a Google sign-in.
        </p>

        <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">
              Ways to fund {shortenAddress(platformAddress)}
            </p>
            <ul className="mt-2 grid gap-1.5 text-muted-foreground">
              {multichainEnabled ? (
                <li>
                  Go back and pick <strong>Receive from another network</strong>: you get an
                  address on Base, Polygon and more, and USDC sent there arrives here by itself.
                </li>
              ) : null}
              <li>
                Ask anyone on {onchainFacts.chain.name} to send USDC straight to
                your SaphraONE address — nothing to bridge.
              </li>
              <li>
                Already hold USDC elsewhere? Switch to a self-custody wallet from
                the account menu, bridge from there, then send it across.
              </li>
            </ul>
          </div>
        </div>
      </section>
    );
  }

  const activeIndex = step ? DEPOSIT_STEPS.indexOf(step) : -1;

  return (
    <section className="section-panel">
      <p className="section-eyebrow">Deposit to Arc</p>
      <h2 className="section-title">Bring USDC onto {onchainFacts.chain.name}</h2>
      <p className="section-copy">
        Bridge USDC from another network over Circle CCTP. SaphraONE switches the
        wallet to the source chain to sign the burn, then returns it to Arc —
        Circle delivers the mint, so there is nothing to sign on Arc.
      </p>

      {sources.length === 0 ? (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">
            No deposit source networks are configured for {onchainFacts.chain.name}.
          </span>
        </div>
      ) : null}

      {resumeFrom ? (
        <div className="mt-5 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="min-w-0">
            This deposit stopped partway. Resume it — starting over would burn
            the USDC a second time.
          </p>
          <Button
            className="shrink-0"
            disabled={busy}
            onClick={() => void handleBridge()}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Resume deposit
          </Button>
        </div>
      ) : null}

      {!isConnected ? (
        <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold text-foreground">
            {hasPlatformWallet
              ? "Bridging needs a wallet on the chain you are sending from"
              : "Connect a wallet to bridge USDC"}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {hasPlatformWallet ? (
              <>
                Your SaphraONE wallet lives on {onchainFacts.chain.name} only, so
                it cannot hold or burn USDC on {source?.name ?? "another chain"}.
                Connect a wallet that already holds USDC there — the bridged
                USDC still arrives in your SaphraONE wallet
                {platformAddress ? ` (${shortenAddress(platformAddress)})` : ""}.
              </>
            ) : (
              <>
                Connect a wallet holding USDC on the network you want to bridge
                from. It arrives on {onchainFacts.chain.name}.
              </>
            )}
          </p>
          <div className="mt-3">
            <WalletConnectButton />
          </div>
          {hasPlatformWallet ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Already have USDC on {onchainFacts.chain.name}? You do not need
              this — it is already spendable from your SaphraONE wallet.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-foreground">From</span>
          <select
            className="h-12 rounded-lg border border-border bg-card px-3 text-sm font-medium"
            disabled={busy || sources.length === 0}
            onChange={(event) => {
              setSourceChainId(Number(event.target.value));
              resetOutcome();
            }}
            value={source?.chainId ?? ""}
          >
            {sources.map((chain) => (
              <option key={chain.chainId} value={chain.chainId}>
                {chain.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-2 rounded-lg border border-border bg-card/75 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-muted-foreground">
              Paying wallet
            </span>
            <span className="font-mono text-xs font-bold">
              {shortenAddress(externalAddress)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-muted-foreground">
              Available on {source?.name ?? "source"}
            </span>
            <span className="font-bold">{balanceLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-muted-foreground">
              Arriving in
            </span>
            <span className="text-right font-mono text-xs font-bold">
              {shortenAddress(recipient)}
              <span className="ml-1 font-sans text-[11px] font-semibold text-muted-foreground">
                {recipient
                  ? recipientIsPlatform
                    ? "(SaphraONE wallet)"
                    : walletSource === "external"
                      ? "(connected wallet)"
                      : "(your wallet)"
                  : ""}
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-muted-foreground">
              Balance on {onchainFacts.chain.name}
            </span>
            <span className="font-bold">
              {typeof arcBalance === "bigint"
                ? `${formatUsdcDisplay(arcBalance)} USDC`
                : "—"}
            </span>
          </div>
        </div>

        <label className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">Amount</span>
            {balanceUnits !== undefined && balanceUnits > zeroAmount ? (
              <button
                className="text-xs font-bold text-primary"
                onClick={() => {
                  setAmount(formatUsdc(balanceUnits));
                  resetOutcome();
                }}
                type="button"
              >
                Max {formatUsdcDisplay(balanceUnits)}
              </button>
            ) : null}
          </div>
          <div className="flex h-12 items-center gap-2 rounded-lg border border-border bg-card px-3">
            <Wallet className="h-4 w-4 text-primary" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
              disabled={busy}
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value);
                resetOutcome();
              }}
              placeholder="100.00 USDC"
              value={amount}
            />
          </div>
        </label>

        {overBalance ? (
          <p className="text-sm font-semibold text-rose-700">
            That is more USDC than this wallet holds on {source?.name}.
          </p>
        ) : null}

        {noGas && !overBalance ? (
          <p className="text-sm font-semibold text-amber-700">
            This wallet has no native gas on {source?.name}. The burn
            transaction will fail until it is topped up.
          </p>
        ) : null}

        {step ? (
          <ol className="grid gap-2 rounded-lg border border-border bg-card/75 p-4">
            {DEPOSIT_STEPS.map((name, index) => {
              const done =
                settled === "complete" ? true : index < activeIndex;
              const active = busy && index === activeIndex;
              return (
                <li className="flex items-center gap-3 text-sm" key={name}>
                  <span
                    className={
                      done
                        ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-bold text-muted-foreground"
                    }
                  >
                    {done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span
                    className={
                      active || done
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {DEPOSIT_STEP_LABELS[name]}
                  </span>
                  {active ? (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {settled === "pending" ? (
          <p className="text-sm font-semibold text-amber-700">
            The burn is confirmed. Circle finishes the mint on{" "}
            {onchainFacts.chain.name} on its own — the balance updates without
            anything further from you.
          </p>
        ) : null}

        {settled === "complete" ? (
          <p className="text-sm font-semibold text-emerald-700">
            Deposit complete. The USDC is on {onchainFacts.chain.name}.
          </p>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}

        {resultUrl ? (
          <a
            className="inline-flex items-center gap-2 text-sm font-bold text-primary"
            href={resultUrl}
            rel="noreferrer"
            target="_blank"
          >
            View transaction
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}

        <Button
          className="h-12 w-full text-sm font-semibold"
          disabled={!canSubmit}
          onClick={() => void handleBridge()}
          type="button"
        >
          {busy || isSwitching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-4 w-4" />
          )}
          {busy
            ? step
              ? DEPOSIT_STEP_LABELS[step]
              : "Starting deposit…"
            : `Bridge to ${onchainFacts.chain.name}`}
        </Button>

        <p className="text-xs text-muted-foreground">
          Circle attestation usually takes a couple of minutes. Keep this tab
          open until the mint step completes.
        </p>
      </div>
    </section>
  );
}
