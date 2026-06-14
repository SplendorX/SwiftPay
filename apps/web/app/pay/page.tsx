import { PayPageShell } from "@/components/pages/pay-page-shell";
import { arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";
import { PaymentCollectionHub } from "@/components/pay/payment-collection-hub";

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
    <PayPageShell>
      <PaymentCollectionHub
        initialAmount={amount}
        initialNote={note}
        initialToken={token}
        initialWalletAddress={recipient}
      />
    </PayPageShell>
  );
}