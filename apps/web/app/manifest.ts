import type { MetadataRoute } from "next";

/**
 * Makes SwiftPay installable: "Add to Home Screen" on iPhone and Android,
 * "Install app" in Chrome and Edge on desktop. It opens in its own window,
 * without browser bars, straight into the dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#080609",
    categories: ["finance", "business", "productivity"],
    description: "Send, request, swap and save USDC and EURC — payments that settle in seconds.",
    display: "standalone",
    icons: [
      { purpose: "any", sizes: "192x192", src: "/icons/icon-192.png", type: "image/png" },
      { purpose: "any", sizes: "512x512", src: "/icons/icon-512.png", type: "image/png" },
      { purpose: "maskable", sizes: "192x192", src: "/icons/maskable-192.png", type: "image/png" },
      { purpose: "maskable", sizes: "512x512", src: "/icons/maskable-512.png", type: "image/png" },
    ],
    id: "/",
    name: "SwiftPay",
    orientation: "any",
    scope: "/",
    short_name: "SwiftPay",
    // Long-press the app icon (Android, desktop) to jump straight in.
    shortcuts: [
      { name: "Send", short_name: "Send", url: "/send", icons: [{ sizes: "192x192", src: "/icons/icon-192.png" }] },
      { name: "Request a payment", short_name: "Request", url: "/pay", icons: [{ sizes: "192x192", src: "/icons/icon-192.png" }] },
      { name: "Swap", short_name: "Swap", url: "/swap", icons: [{ sizes: "192x192", src: "/icons/icon-192.png" }] },
      { name: "Activity", short_name: "Activity", url: "/activity", icons: [{ sizes: "192x192", src: "/icons/icon-192.png" }] },
    ],
    start_url: "/dashboard?source=app",
    theme_color: "#080609",
  };
}
