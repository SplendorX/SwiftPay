import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectRoot, "../..");

loadEnv({ path: join(workspaceRoot, ".env"), quiet: true });
loadEnv({ path: join(projectRoot, ".env.local"), quiet: true });

if (!process.env.NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS?.trim()) {
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
  async rewrites() {
    return [
      { source: "/batchpay", destination: "/swiftBatch" },
      { source: "/batchpay/:path*", destination: "/swiftBatch/:path*" },
      { source: "/batchPay", destination: "/swiftBatch" },
      { source: "/batchPay/:path*", destination: "/swiftBatch/:path*" },
    ];
  },
};

export default nextConfig;
