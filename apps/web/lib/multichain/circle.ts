// Server-only: reads CIRCLE_* secrets and must never reach a browser bundle.
/**
 * Circle Wallets calls for deposit addresses. Each deposit address is a
 * developer-controlled smart contract account (SCA) on one network, so Gas
 * Station pays its gas and it never needs a native token.
 */
import { createHash } from "node:crypto";

import { getAgentWalletClient, readCircleError } from "@/lib/agent-wallet/client";
import type { MultichainChain } from "@/lib/multichain/chains";
import { idempotencyUuid, usdcToUnits } from "@/lib/multichain/rules";

const WALLET_SET_NAME = "SaphraONE deposit addresses";

let walletSetIdPromise: Promise<string> | null = null;

/**
 * The wallet set every deposit address lives in. CIRCLE_DEPOSIT_WALLET_SET_ID
 * pins it; otherwise it is found by name, or created once.
 */
export function depositWalletSetId() {
  const configured = process.env.CIRCLE_DEPOSIT_WALLET_SET_ID?.trim();
  if (configured) return Promise.resolve(configured);

  walletSetIdPromise ??= (async () => {
    const client = getAgentWalletClient();
    const listed = await client.listWalletSets({ pageSize: 50 });
    const existing = listed.data?.walletSets?.find(
      (set) => (set as { name?: string }).name === WALLET_SET_NAME,
    );
    if (existing?.id) return existing.id;

    const created = await client.createWalletSet({
      idempotencyKey: idempotencyUuid(createHash("sha256").update(`wallet-set:${WALLET_SET_NAME}`).digest("hex")),
      name: WALLET_SET_NAME,
    });
    const id = created.data?.walletSet?.id;
    if (!id) throw new Error("Circle did not return a deposit wallet set.");
    return id;
  })().catch((error) => {
    walletSetIdPromise = null;
    throw error;
  });

  return walletSetIdPromise;
}

export type CreatedDepositWallet = { address: string; walletId: string };

/** Create (or, on a retry, return) the owner's deposit wallet on one network. */
export async function createDepositWallet(
  ownerWallet: string,
  chain: MultichainChain,
): Promise<CreatedDepositWallet> {
  const client = getAgentWalletClient();
  const walletSetId = await depositWalletSetId();
  const owner = ownerWallet.toLowerCase();

  try {
    const response = await client.createWallets({
      accountType: "SCA",
      blockchains: [chain.circleBlockchain as never],
      count: 1,
      // Same owner and network → same key, so a retry never makes a second wallet.
      idempotencyKey: idempotencyUuid(
        createHash("sha256").update(`deposit:${owner}:${chain.circleBlockchain}`).digest("hex"),
      ),
      metadata: [{ name: `SaphraONE deposit ${chain.key}`, refId: owner }],
      walletSetId,
    });
    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet.address) {
      throw new Error("Circle did not return a deposit wallet.");
    }
    return { address: wallet.address, walletId: wallet.id };
  } catch (error) {
    throw new Error(readCircleError(error, "Deposit address could not be created."));
  }
}

/** The deposit wallet's USDC on its network, in 6-decimal units. */
export async function depositUsdcBalance(walletId: string, chain: MultichainChain) {
  const client = getAgentWalletClient();
  const response = await client.getWalletTokenBalance({ id: walletId, includeAll: true });
  const usdc = chain.usdcAddress.toLowerCase();
  const entry = (response.data?.tokenBalances ?? []).find(
    (balance) => balance.token?.tokenAddress?.toLowerCase() === usdc,
  );
  return entry?.amount ? usdcToUnits(entry.amount) : 0n;
}

const tokenAddressCache = new Map<string, string | null>();

async function tokenAddressFor(tokenId: string) {
  if (tokenAddressCache.has(tokenId)) return tokenAddressCache.get(tokenId) ?? null;
  const response = await getAgentWalletClient().getToken({ id: tokenId });
  const address = response.data?.token?.tokenAddress?.toLowerCase() ?? null;
  tokenAddressCache.set(tokenId, address);
  return address;
}

export type InboundTransfer = {
  amount: string;
  circleTxId: string;
  sender: string | null;
  state: string;
  txHash: string;
};

/**
 * USDC that arrived at a deposit wallet, newest first. Anything that is not
 * the network's USDC (another token, a native coin) is left out: it is never
 * credited.
 */
export async function listInboundUsdc(walletId: string, chain: MultichainChain, since?: string) {
  const client = getAgentWalletClient();
  // No `blockchain` filter: Circle rejects it alongside walletIds, and the
  // wallet id already pins the network.
  const response = await client.listTransactions({
    ...(since ? { from: since } : {}),
    pageSize: 50,
    txType: "INBOUND" as never,
    walletIds: [walletId],
  });
  const usdc = chain.usdcAddress.toLowerCase();
  const transfers: InboundTransfer[] = [];
  for (const tx of response.data?.transactions ?? []) {
    if (!tx.txHash || !tx.tokenId) continue;
    if ((await tokenAddressFor(tx.tokenId)) !== usdc) continue;
    const amount = tx.amounts?.[0];
    if (!amount) continue;
    transfers.push({
      amount,
      circleTxId: tx.id,
      sender: tx.sourceAddress ?? null,
      state: tx.state ?? "",
      txHash: tx.txHash,
    });
  }
  return transfers;
}

export type OutboundTransaction = { createDate: string; state: string; txHash: string | null };

/** What the deposit wallet sent since a moment: the approve and burn of a sweep. */
export async function listOutbound(walletId: string, chain: MultichainChain, since: string) {
  const client = getAgentWalletClient();
  const response = await client.listTransactions({
    from: since,
    pageSize: 50,
    txType: "OUTBOUND" as never,
    walletIds: [walletId],
  });
  return (response.data?.transactions ?? []).map<OutboundTransaction>((tx) => ({
    createDate: tx.createDate,
    state: tx.state ?? "",
    txHash: tx.txHash ?? null,
  }));
}

/** App Kit adapter credentials, read here and never placed on a response. */
export function circleWalletsCredentials() {
  const apiKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY?.trim();
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
  if (!apiKey || !entitySecret) {
    throw new Error(
      "Multichain deposits need CIRCLE_DEVELOPER_CONTROLLED_API_KEY and CIRCLE_ENTITY_SECRET.",
    );
  }
  return { apiKey, entitySecret };
}
