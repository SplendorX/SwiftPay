import { readCircleLogin } from "@/lib/circle-session";

import type { WalletMode } from "@/components/profile-menu";

export function resolvePlatformWalletMode(): WalletMode {
  return readCircleLogin() ? "circle" : "external";
}