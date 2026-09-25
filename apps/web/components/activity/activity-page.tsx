"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";

import { WalletReceiptModal } from "@/components/activity/wallet-receipt-modal";
import {
  BatchReceiptModal,
  type BatchReceiptData,
} from "@/components/batch/batch-receipt-modal";
import type { AccountActivityItem } from "@/lib/activity/merge";
import {
  downloadBatchReceiptImage,
  shareBatchReceiptImage,
} from "@/lib/batch-receipt";
import type { ArcTokenSymbol } from "@/lib/tokens";
import { AccountActivity } from "@/components/dashboard/account-activity";
import type { WalletTransfer } from "@/lib/arcscan-history";
import { arcChain } from "@/lib/chains";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { useWalletTransfers } from "@/lib/use-wallet-transfers";

/** Rebuild a BatchPay receipt from the batch details kept with the activity. */
function batchReceiptFrom(item: AccountActivityItem, wallet: string): BatchReceiptData | null {
  const batch = item.batch;
  if (!batch?.recipients.length) return null;
  const token = (item.token ?? "USDC") as ArcTokenSymbol;
  const hash = item.transfer?.hash ?? item.txHashes[0] ?? null;
  return {
    explorerUrl: hash ? `${arcChain.blockExplorers.default.url}/tx/${hash}` : null,
    feeAmount: batch.fee ?? "Not recorded",
    mode: batch.mode ?? "BatchPay",
    payoutTotal: `${item.amount ?? "0"} ${token}`,
    recipientCount: batch.recipients.length,
    recipients: batch.recipients.map((recipient, index) => ({
      address: recipient.wallet,
      amount: recipient.amount,
      label: recipient.label ?? undefined,
      line: index + 1,
    })),
    submittedAt: item.occurredAt ?? new Date().toISOString(),
    token,
    txHash: hash,
    walletAddress: wallet,
    kind: batch.kind ?? "batch",
    runName: batch.name ?? null,
  };
}

/** The account's full activity ledger, on its own page. */
export function ActivityPage() {
  const { address, isConnected } = usePlatformWallet();
  const { error, isLoading, transfers } = useWalletTransfers(address);
  const [receipt, setReceipt] = useState<WalletTransfer | null>(null);
  const closeReceipt = useCallback(() => setReceipt(null), []);
  const [batchReceipt, setBatchReceipt] = useState<BatchReceiptData | null>(null);
  const closeBatchReceipt = useCallback(() => setBatchReceipt(null), []);
  const explorerUrl = address
    ? `${arcChain.blockExplorers.default.url}/address/${address}`
    : arcChain.blockExplorers.default.url;

  return (
    <div className="activity-page">
      <header className="activity-hero">
        <div className="activity-hero-copy">
          <p className="activity-hero-eyebrow">Account ledger</p>
          <h1 className="activity-hero-title">Activity</h1>
          <p className="activity-hero-lede">
            Every payment, swap and saving, in one place.
          </p>
        </div>
        <a
          className="activity-hero-link"
          href={explorerUrl}
          rel="noreferrer"
          target="_blank"
        >
          View on ArcScan
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>

      <AccountActivity
        hideHeading
        isConnected={isConnected}
        onOpenBatch={(item) => {
          if (address) setBatchReceipt(batchReceiptFrom(item, address));
        }}
        onOpenReceipt={setReceipt}
        ownerWallet={address}
        transfers={transfers}
        transfersError={error}
        transfersLoading={isLoading}
        walletExplorerUrl={explorerUrl}
      />

      {batchReceipt ? (
        <BatchReceiptModal
          onClose={closeBatchReceipt}
          onDownload={(named) => void downloadBatchReceiptImage(named).catch(() => undefined)}
          onShare={(named) => void shareBatchReceiptImage(named).catch(() => undefined)}
          receipt={batchReceipt}
        />
      ) : null}

      {receipt && address ? (
        <WalletReceiptModal
          onClose={closeReceipt}
          transfer={receipt}
          walletAddress={address}
        />
      ) : null}
    </div>
  );
}
