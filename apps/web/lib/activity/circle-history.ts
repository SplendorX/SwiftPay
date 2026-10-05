"use client";

import { getAddress, isAddress, type Address, type Hash } from "viem";

import type { WalletTransfer } from "@/lib/arcscan-history";
import { personalCircleWallet } from "@/lib/business/provision-wallet";
import { callCircleWalletApi, readCircleLogin, readCircleWallets } from "@/lib/circle-session";
import type { ArcTokenSymbol } from "@/lib/tokens";

/**
 * A Circle wallet's own transaction list, as wallet transfers.
 *
 * The Arc RPC store fills a wallet's on-chain history a slice at a time (the
 * public RPC allows only a few reads a second), so older transfers can be
 * missing for a while. Circle keeps every transaction of the wallets it
 * holds, with its time, so for a Circle wallet the full window is available
 * at once. Transfers already in the RPC store win when both have them.
 */

type CircleTransaction = {
  id?: string;
  amounts?: string[];
  createDate?: string;
  destinationAddress?: string;
  firstConfirmDate?: string;
  operation?: string;
  sourceAddress?: string;
  state?: string;
  tokenId?: string;
  transactionType?: string;
  txHash?: string;
  walletId?: string;
};

const pageSize = 50;
/** At most this many pages per load (300 transactions), newest first. */
const maxPages = 6;
const settledStates = new Set(["COMPLETE", "CONFIRMED"]);
const knownSymbols = new Set<ArcTokenSymbol>(["USDC", "EURC"]);

// Token ids don't change; remember them for the session.
const tokenSymbols = new Map<string, ArcTokenSymbol | null>();

async function symbolFor(tokenId: string, userToken: string): Promise<ArcTokenSymbol | null> {
  if (tokenSymbols.has(tokenId)) return tokenSymbols.get(tokenId) ?? null;
  try {
    const payload = await callCircleWalletApi<{ token?: { symbol?: string } }>("getToken", { tokenId, userToken });
    const symbol = payload.token?.symbol?.toUpperCase() as ArcTokenSymbol | undefined;
    const known = symbol && knownSymbols.has(symbol) ? symbol : null;
    tokenSymbols.set(tokenId, known);
    return known;
  } catch {
    return null;
  }
}

function addressOf(value?: string): Address | null {
  return value && isAddress(value) ? (getAddress(value) as Address) : null;
}

/** The Circle wallet behind `ownerWallet`, if this session holds it. */
function sessionWalletFor(ownerWallet: string) {
  const login = readCircleLogin();
  if (!login) return null;
  const wallets = readCircleWallets();
  const owner = ownerWallet.toLowerCase();
  const wallet =
    wallets.find((entry) => entry.address?.toLowerCase() === owner) ??
    (personalCircleWallet(wallets)?.address?.toLowerCase() === owner ? personalCircleWallet(wallets) : null);
  return wallet?.id ? { login, walletId: wallet.id } : null;
}

export async function fetchCircleWalletTransfers(ownerWallet: string, since: Date): Promise<WalletTransfer[]> {
  const session = sessionWalletFor(ownerWallet);
  if (!session) return [];

  const rows: CircleTransaction[] = [];
  let pageAfter: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await callCircleWalletApi<{ transactions?: CircleTransaction[] }>("listTransactions", {
      from: since.toISOString(),
      pageAfter,
      pageSize,
      userToken: session.login.userToken,
      walletId: session.walletId,
    });
    const batch = payload.transactions ?? [];
    rows.push(...batch);
    if (batch.length < pageSize || !batch[batch.length - 1]?.id) break;
    pageAfter = batch[batch.length - 1].id;
  }

  const self = ownerWallet.toLowerCase();
  const transfers: WalletTransfer[] = [];
  for (const row of rows) {
    if (!row.txHash || !/^0x[0-9a-fA-F]{64}$/.test(row.txHash)) continue;
    if (row.state && !settledStates.has(row.state.toUpperCase())) continue;
    const amount = row.amounts?.[0];
    if (!amount || !(Number(amount) > 0) || !row.tokenId) continue;
    const direction = row.transactionType?.toUpperCase() === "INBOUND" ? "in" : "out";
    const counterparty = addressOf(direction === "in" ? row.sourceAddress : row.destinationAddress);
    if (!counterparty || counterparty.toLowerCase() === self) continue;
    const symbol = await symbolFor(row.tokenId, session.login.userToken);
    if (!symbol) continue;
    transfers.push({
      amount,
      blockNumber: 0,
      counterparty,
      counterpartyIsContract: false,
      direction,
      hash: row.txHash.toLowerCase() as Hash,
      logIndex: 0,
      method: null,
      symbol,
      timestamp: row.firstConfirmDate ?? row.createDate ?? null,
    });
  }
  return transfers;
}

/** RPC transfers plus Circle's, each transaction and direction once. */
export function mergeTransferSources(primary: WalletTransfer[], extra: WalletTransfer[]) {
  const seen = new Set(primary.map((transfer) => `${transfer.hash.toLowerCase()}:${transfer.direction}`));
  const added = extra.filter((transfer) => !seen.has(`${transfer.hash.toLowerCase()}:${transfer.direction}`));
  if (added.length === 0) return primary;
  const time = (value: string | null) => (value ? Date.parse(value) || 0 : 0);
  return [...primary, ...added].sort((left, right) => time(right.timestamp) - time(left.timestamp));
}
