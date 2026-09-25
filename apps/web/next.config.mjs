import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectRoot, "../..");

loadEnv({ path: join(workspaceRoot, ".env"), quiet: true });
loadEnv({ path: join(projectRoot, ".env.local"), quiet: true });

// Testnet only: a mainnet build must never fall back to a testnet contract.
if (
  process.env.NEXT_PUBLIC_ARC_NETWORK?.trim().toLowerCase() !== "mainnet" &&
  !process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS?.trim()
) {
  process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS =
    "0xcBF3559D59b536cc3aB55C32e502F72Bd111588a";
}

const publicEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) =>
      key.startsWith("NEXT_PUBLIC_") &&
      typeof value === "string" &&
      value.trim().length > 0,
  ),
);

function allowedDevOrigins() {
  const origins = new Set(["localhost", "127.0.0.1"]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).hostname);
    } catch {
      // Ignore invalid app URLs.
    }
  }
  return [...origins];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: publicEnv,
  allowedDevOrigins: allowedDevOrigins(),
  reactStrictMode: false,
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  experimental: {
    // Turbopack's on-disk dev cache (on by default in Next 16) served stale
    // CSS, hung the server and took 40s+ per write on this Windows setup, so
    // edits often needed a restart to show. Off: every edit is compiled fresh.
    // Dev only; production builds are unaffected.
    turbopackFileSystemCacheForDev: false,
  },
  webpack(config) {
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      "pino-pretty",
      "lokijs",
      "encoding",
    ];
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };

    return config;
  },
  // The service worker must never be served stale, or an old version keeps
  // running after a deploy.
  //
  // Security headers apply to every route. The CSP deliberately leaves
  // script-src alone: the Circle and WalletConnect SDKs load code and frames
  // from many origins. It still blocks framing (clickjacking), <base>
  // hijacking, plugins and form posts to other sites.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  // BatchPay, RecurePay and Circle used to live under /swiftBatch,
  // /swiftRecurepay and /swiftCircle. Old bookmarks, shared links, stored
  // notifications and ALLIE history keep working.
  async redirects() {
    return [
      { source: "/swiftCircle", destination: "/circle", permanent: true },
      { source: "/swiftCircle/:path*", destination: "/circle/:path*", permanent: true },
      { source: "/swiftBatch", destination: "/batchpay", permanent: true },
      { source: "/swiftBatch/:path*", destination: "/batchpay/:path*", permanent: true },
      { source: "/swiftRecurepay", destination: "/recurepay", permanent: true },
      { source: "/swiftRecurepay/:path*", destination: "/recurepay/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
