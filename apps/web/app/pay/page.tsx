import { isAddress } from "viem";

import { PayPageShell } from "@/components/pages/pay-page-shell";
import { PaymentCollectionHub } from "@/components/pay/payment-collection-hub";
import { normalizeUsername } from "@/lib/profile-utils";
import { arcTokenSymbols, type ArcTokenSymbol } from "@/lib/tokens";

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
  const usernameParam = normalizeUsername(readParam(params, "username"));
  const recipientParam =
    readParam(params, "to") ||
    readParam(params, "recipient") ||
    readParam(params, "wallet");
  const recipientIsAddress = isAddress(recipientParam);
  const username =
    usernameParam ||
    (!recipientIsAddress ? normalizeUsername(recipientParam) : "");
  const recipient = recipientIsAddress ? recipientParam : "";
  const amount = readParam(params, "amount");
  const note = readParam(params, "note") || readParam(params, "memo");
  const token = normalizeToken(readParam(params, "token"));

  return (
    <PayPageShell>
      <PaymentCollectionHub
        initialAmount={amount}
        initialNote={note}
        initialToken={token}
        initialUsername={username}
        initialWalletAddress={recipient}
      />
    </PayPageShell>
  );
}