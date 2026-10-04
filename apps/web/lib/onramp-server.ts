// Server-only. Circle Onramp, shared by the deposit page and Checkout.
import { createOnrampServerKit } from "@circle-fin/onramp-kit/server";

import { isArcMainnet } from "@/lib/network";

/**
 * The page that embeds the widget, as a bare hostname. Only used when the
 * widget falls back to an iframe (installed app, in-app browsers); from
 * trusted config, never from the request.
 */
function referrerDomain() {
  const configured = process.env.ONRAMP_REFERRER_DOMAIN?.trim();
  if (configured) return configured;
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname || undefined;
  } catch {
    return undefined;
  }
}

/** Null when ONRAMP_API_KEY isn't configured. */
export function onrampServer() {
  const apiKey = process.env.ONRAMP_API_KEY?.trim();
  if (!apiKey) return null;
  return createOnrampServerKit({ apiKey, referrerDomain: referrerDomain() });
}

/** Session options that send USDC on Arc to `destinationAddress`. */
export function onrampSessionInput(input: { appUserId: string; destinationAddress: string }) {
  const mainnet = isArcMainnet();
  return {
    appUserId: input.appUserId,
    destinationAddress: input.destinationAddress,
    destinationChain: mainnet ? ("Arc" as const) : ("Arc_Testnet" as const),
    ...(mainnet ? { assets: { pairs: [{ chain: "arc" as const, token: "USDC" as const }] } } : {}),
  };
}
