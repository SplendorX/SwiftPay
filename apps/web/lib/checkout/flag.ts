/**
 * Gates Checkout's entry points on pages people already use (quick actions,
 * app shortcut, the dashboard receive QR, the overview card). The Checkout
 * pages and routes themselves are always deployed and reachable by URL.
 * Inlined at build time, so a change needs a redeploy.
 */
export const checkoutEnabled = process.env.NEXT_PUBLIC_CHECKOUT_ENABLED === "true";
