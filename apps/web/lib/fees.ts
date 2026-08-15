import { formatUnits } from "viem";

/** Platform fee on direct sends: 0.1%. */
export const SEND_FEE_BPS = 10;

/** Platform fee on swaps: 0.3%. */
export const SWAP_FEE_BPS = 30;

export const FEE_BPS_DENOMINATOR = 10_000;

export function platformFeeRecipient() {
  return process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim() ?? "";
}

export function platformFeeUnits(
  amountUnits: bigint,
  bps: number = SEND_FEE_BPS,
): bigint {
  if (amountUnits <= 0n || bps <= 0) {
    return 0n;
  }

  return (amountUnits * BigInt(bps)) / BigInt(FEE_BPS_DENOMINATOR);
}

export function formatFeeAmount(amountUnits: bigint, decimals: number) {
  return formatUnits(amountUnits, decimals);
}

export function feePercentLabel(bps: number) {
  const whole = Math.floor(bps / 100);
  const fraction = (bps % 100).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}
