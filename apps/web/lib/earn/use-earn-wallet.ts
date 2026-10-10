"use client";

/**
 * Earn's view of the session's signing wallet.
 *
 * The underlying hook is shared with the OnePoints purchase flow, which
 * needs the same Circle-or-external provider resolution.
 */
export {
  useSigningWallet as useEarnWallet,
  type SigningWallet as EarnWallet,
  type SigningWalletKind as EarnWalletKind,
} from "@/lib/use-signing-wallet";
