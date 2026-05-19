export const walletAuthChallengeTtlMs = 10 * 60 * 1000;
export const walletAuthSessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export type WalletAuthMessageInput = {
  issuedAt: string;
  nonce: string;
  ownerWallet: string;
};

export function buildWalletAuthMessage({
  issuedAt,
  nonce,
  ownerWallet,
}: WalletAuthMessageInput) {
  return [
    "Sign in to SwiftPay",
    `Wallet: ${ownerWallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}
