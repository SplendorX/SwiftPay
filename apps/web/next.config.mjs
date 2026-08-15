import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectRoot, "../..");

loadEnv({ path: join(workspaceRoot, ".env"), quiet: true });

const publicEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) =>
      key.startsWith("NEXT_PUBLIC_") &&
      typeof value === "string" &&
      value.trim().length > 0,
  ),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: publicEnv,
  allowedDevOrigins: ["127.0.0.1"],
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
};

export default nextConfig;
