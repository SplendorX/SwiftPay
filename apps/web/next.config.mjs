import { config as loadEnv } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(projectRoot, "../..");

loadEnv({ path: join(workspaceRoot, ".env"), quiet: true });

const normalizedCwd = process.cwd().replace(/\\/g, "/");
const normalizedAppRoot = projectRoot.replace(/\\/g, "/");
const isVercelMonorepoRootBuild =
  process.env.VERCEL === "1" &&
  normalizedCwd !== normalizedAppRoot &&
  !normalizedCwd.endsWith("/apps/web");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  reactStrictMode: false,
  // Monorepo tracing from workspace root; legacy fallback when Vercel Root Directory
  // still points at the repository root instead of apps/web.
  outputFileTracingRoot: workspaceRoot,
  ...(isVercelMonorepoRootBuild ? { distDir: "../../.next" } : {}),
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
