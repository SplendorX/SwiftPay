import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const appNextDir = join(repoRoot, "apps", "web", ".next");
const projectNextDir = join(process.cwd(), ".next");
const projectRoutesManifest = join(projectNextDir, "routes-manifest.json");

if (!existsSync(appNextDir)) {
  console.error("Expected Next.js output at apps/web/.next but it was not found.");
  process.exit(1);
}

if (existsSync(projectRoutesManifest)) {
  console.log("Next.js output already present at project root; skipping sync.");
  process.exit(0);
}

if (existsSync(projectNextDir)) {
  rmSync(projectNextDir, { recursive: true, force: true });
}

cpSync(appNextDir, projectNextDir, { recursive: true });
console.log("Synced apps/web/.next to project root .next for Vercel.");