/** Categories that never trigger Spend&Save. Pure — unit tested. */
export function isEligibleOutgoingPayment(meta: {
  kind?: string | null;
  isSavingsDeposit?: boolean;
  isSavingsWithdrawal?: boolean;
  isInternalTransfer?: boolean;
  isFailed?: boolean;
  isReversed?: boolean;
  isRefund?: boolean;
  isSystem?: boolean;
}) {
  if (
    meta.isSavingsDeposit ||
    meta.isSavingsWithdrawal ||
    meta.isInternalTransfer ||
    meta.isFailed ||
    meta.isReversed ||
    meta.isRefund ||
    meta.isSystem
  ) {
    return false;
  }

  const kind = (meta.kind ?? "outgoing").toLowerCase();
  if (
    [
      "savings_deposit",
      "savings_withdrawal",
      "internal",
      "refund",
      "reversal",
      "system",
      "swap",
      "earn_deposit",
      "earn_withdraw",
    ].includes(kind)
  ) {
    return false;
  }

  return true;
}
