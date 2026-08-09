import { formatUnits, isAddress, type Address, type Hash } from "viem";

import { arcTestnetTokens, type ArcTokenSymbol } from "@/lib/tokens";

export const arcScanBaseUrl = "https://testnet.arcscan.app";

export type WalletTransfer = {
  amount: string;
  blockNumber: number;
  counterparty: Address;
  counterpartyIsContract: boolean;
  direction: "in" | "out";
  hash: Hash;
  logIndex: number;
  method: string | null;
  symbol: ArcTokenSymbol;
  timestamp: string | null;
};

type ArcScanAddress = {
  hash?: string;
  is_contract?: boolean;
};

export type ArcScanTokenTransfer = {
  block_number?: number;
  from?: ArcScanAddress | null;
  log_index?: number;
  method?: string | null;
  timestamp?: string | null;
  to?: ArcScanAddress | null;
  token?: {
    address_hash?: string;
    decimals?: string;
    symbol?: string;
  } | null;
  total?: {
    decimals?: string;
    value?: string;
  } | null;
  transaction_hash?: string;
};

export type ArcScanTokenTransferResponse = {
  items?: ArcScanTokenTransfer[];
  message?: string;
};

export function getArcScanHistoryUrls(address: string) {
  return Object.values(arcTestnetTokens).map(
    (token) =>
      `${arcScanBaseUrl}/api/v2/addresses/${address}/token-transfers?type=ERC-20&token=${token.address}`,
  );
}

function getTokenSymbol(tokenAddress?: string): ArcTokenSymbol | undefined {
  if (!tokenAddress) {
    return undefined;
  }

  return (Object.keys(arcTestnetTokens) as ArcTokenSymbol[]).find(
    (symbol) =>
      arcTestnetTokens[symbol].address.toLowerCase() ===
      tokenAddress.toLowerCase(),
  );
}

function normalizeAddress(value?: string): Address | undefined {
  if (!value || !isAddress(value)) {
    return undefined;
  }

  return value as Address;
}

/** Platform fee wallets — transfers to these are hidden from end-user history. */
export function getPlatformFeeRecipientAddresses(): string[] {
  const values = [
    process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim(),
    process.env.PLATFORM_FEE_RECIPIENT?.trim(),
  ].filter(Boolean) as string[];

  return [...new Set(values.map((value) => value.toLowerCase()))];
}

function isPlatformFeeTransfer(
  transfer: Pick<WalletTransfer, "direction" | "counterparty">,
  feeRecipients: string[],
) {
  if (transfer.direction !== "out" || feeRecipients.length === 0) {
    return false;
  }
  return feeRecipients.includes(transfer.counterparty.toLowerCase());
}

export function normalizeArcScanTokenTransfers(
  address: string,
  payload: ArcScanTokenTransferResponse | ArcScanTokenTransferResponse[],
  options?: {
    /** When true (default), hide outbound transfers to the platform fee recipient. */
    hidePlatformFees?: boolean;
  },
) {
  const walletAddress = address.toLowerCase();
  const payloads = Array.isArray(payload) ? payload : [payload];
  const hidePlatformFees = options?.hidePlatformFees !== false;
  const feeRecipients = hidePlatformFees
    ? getPlatformFeeRecipientAddresses()
    : [];

  return payloads
    .flatMap((item) => item.items ?? [])
    .map((transfer): WalletTransfer | undefined => {
      const symbol = getTokenSymbol(transfer.token?.address_hash);
      const from = normalizeAddress(transfer.from?.hash);
      const to = normalizeAddress(transfer.to?.hash);
      const hash = transfer.transaction_hash;
      const value = transfer.total?.value;

      if (!symbol || !from || !to || !hash || !value) {
        return undefined;
      }

      const direction = from.toLowerCase() === walletAddress ? "out" : "in";
      const counterparty = direction === "out" ? to : from;
      const counterpartyIsContract =
        direction === "out"
          ? Boolean(transfer.to?.is_contract)
          : Boolean(transfer.from?.is_contract);
      const decimals = Number(
        transfer.total?.decimals ??
          transfer.token?.decimals ??
          arcTestnetTokens[symbol].decimals,
      );

      return {
        amount: formatUnits(BigInt(value), decimals),
        blockNumber: transfer.block_number ?? 0,
        counterparty,
        counterpartyIsContract,
        direction,
        hash: hash as Hash,
        logIndex: transfer.log_index ?? 0,
        method: transfer.method ?? null,
        symbol,
        timestamp: transfer.timestamp ?? null,
      };
    })
    .filter((transfer): transfer is WalletTransfer => Boolean(transfer))
    .filter((transfer) => !isPlatformFeeTransfer(transfer, feeRecipients))
    .sort((left, right) => {
      if (left.blockNumber === right.blockNumber) {
        return right.logIndex - left.logIndex;
      }

      return right.blockNumber - left.blockNumber;
    })
    .slice(0, 100);
}
