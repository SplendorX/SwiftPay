import type { ArcTokenSymbol } from "@/lib/tokens";

type BuildPaymentRequestUrlInput = {
  amount?: string;
  chainId?: number;
  memo?: string;
  origin: string;
  path?: "/dashboard" | "/pay";
  token?: ArcTokenSymbol;
  username?: string;
  walletAddress?: string;
};

export function buildPaymentRequestUrl({
  amount,
  chainId,
  memo,
  origin,
  path = "/dashboard",
  token,
  username,
  walletAddress,
}: BuildPaymentRequestUrlInput) {
  const requestUrl = new URL(path, origin);

  if (username) {
    requestUrl.searchParams.set("username", username);
  } else if (walletAddress) {
    requestUrl.searchParams.set("to", walletAddress);
  }

  if (amount?.trim()) {
    requestUrl.searchParams.set("amount", amount.trim());
  }

  if (token) {
    requestUrl.searchParams.set("token", token);
  }

  if (chainId) {
    requestUrl.searchParams.set("chainId", String(chainId));
  }

  if (memo?.trim()) {
    requestUrl.searchParams.set("memo", memo.trim());
  }

  return requestUrl.toString();
}

export function buildPaymentRequestPath(
  input: Omit<BuildPaymentRequestUrlInput, "origin">,
) {
  const url = new URL(
    buildPaymentRequestUrl({ ...input, origin: "https://swiftpay.local" }),
  );

  return `${url.pathname}${url.search}`;
}