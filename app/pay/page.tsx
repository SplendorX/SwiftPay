import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformPageBody } from "@/components/platform-page-body";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";
import { PaymentRequestBuilder } from "./payment-request-builder";

type PayPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeToken(value: string): ArcTokenSymbol {
  return arcTokenSymbols.includes(value as ArcTokenSymbol)
    ? (value as ArcTokenSymbol)
    : "USDC";
}

export default async function PayPage({ searchParams }: PayPageProps) {
  const params = await searchParams;
  const recipient =
    readParam(params, "to") ||
    readParam(params, "recipient") ||
    readParam(params, "wallet");
  const amount = readParam(params, "amount");
  const note = readParam(params, "note") || readParam(params, "memo");
  const token = normalizeToken(readParam(params, "token"));

  return (
    <PlatformAccessGate>
    <main className="relative min-h-screen overflow-hidden px-0 py-4 text-ink sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none absolute inset-0" />
      <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-none flex-col gap-4">
        <header className="surface-panel relative z-[120] flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <Link className="flex min-w-0 items-center gap-3 justify-self-start" href="/">
            <BrandMark className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="font-heading truncate text-xl font-semibold leading-none tracking-normal">
                <span className="text-ink">Swift</span>
                <span className="text-swift-700">Pay</span>
              </p>
              <p className="truncate text-sm font-semibold text-muted">
                Payrequest
              </p>
            </div>
          </Link>

          <PlatformProfileControls />
        </header>

        <PlatformPageBody>
          <PaymentRequestBuilder
            initialAmount={amount}
            initialNote={note}
            initialToken={token}
            initialWalletAddress={recipient}
          />
        </PlatformPageBody>
      </div>
    </main>
    </PlatformAccessGate>
  );
}
