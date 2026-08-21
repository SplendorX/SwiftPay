import { callCircleWalletApi } from "@/lib/circle-session";

export function isOnchainTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function extractCircleTxHash(result: unknown) {
  const root = asRecord(result);
  const data = asRecord(root?.data);
  const nested = asRecord(data?.transaction) ?? asRecord(root?.transaction);
  const candidates = [
    data?.txHash,
    data?.transactionHash,
    data?.hash,
    nested?.txHash,
    nested?.transactionHash,
    nested?.hash,
    root?.txHash,
    root?.transactionHash,
    root?.hash,
  ];
  return candidates.find(isOnchainTxHash);
}

export function extractCircleTransactionId(result: unknown) {
  const root = asRecord(result);
  const data = asRecord(root?.data);
  const candidates = [
    data?.transactionId,
    data?.id,
    root?.transactionId,
    root?.id,
  ];
  return candidates.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

export async function recoverCircleTxHash(input: {
  attempts?: number;
  skipHashes?: string[];
  transactionId?: string;
  userToken: string;
  walletId: string;
}) {
  const skip = new Set(
    (input.skipHashes ?? []).map((hash) => hash.toLowerCase()),
  );
  const attempts = input.attempts ?? 8;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      const delayMs = Math.min(400 * 2 ** (attempt - 1), 1_500);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      if (input.transactionId) {
        const tx = await callCircleWalletApi<unknown>("getTransaction", {
          transactionId: input.transactionId,
          userToken: input.userToken,
        });
        const hash = extractCircleTxHash(tx);
        if (hash && !skip.has(hash.toLowerCase())) {
          return hash;
        }
      }
    } catch {
      // transactionId may be a challenge id; fall through to the wallet list
    }

    try {
      const listed = await callCircleWalletApi<{
        data?: {
          transactions?: Array<{
            transactionHash?: string;
            txHash?: string;
          }>;
        };
        transactions?: Array<{
          transactionHash?: string;
          txHash?: string;
        }>;
      }>("listTransactions", {
        pageSize: 8,
        userToken: input.userToken,
        walletId: input.walletId,
      });
      const rows = listed.data?.transactions ?? listed.transactions ?? [];
      for (const row of rows) {
        const hash = extractCircleTxHash(row) ?? row.txHash ?? row.transactionHash;
        if (isOnchainTxHash(hash) && !skip.has(hash.toLowerCase())) {
          return hash;
        }
      }
    } catch {
      // keep polling
    }
  }

  return null;
}
