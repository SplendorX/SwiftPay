/**
 * Set Vercel's Production (Arc mainnet) and Preview (Arc testnet) variables
 * from two local env files, so each environment has exactly its own values.
 *
 *   node scripts/vercel-sync-production-env.mjs            # dry run
 *   node scripts/vercel-sync-production-env.mjs --apply    # change Vercel
 *
 * Reads .env.vercel-production and .env.vercel-preview from the repo root
 * (both git-ignored). Run from the repo root, which is linked to the project.
 *
 * Both environments are rebuilt from the files rather than edited in place:
 * many variables are shared by Preview and Production, and `vercel env pull`
 * returns sensitive values as "[SENSITIVE]", so nothing read back from Vercel
 * can be trusted as a value. The files are the source of truth. Values are
 * never printed.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const FILES = {
  production: ".env.vercel-production",
  preview: ".env.vercel-preview",
};

function parse(path) {
  const vars = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const value = match[2].replace(/^"(.*)"$/, "$1");
    if (value !== "") vars.set(match[1], value);
  }
  return vars;
}

function vercel(args, input) {
  const result = spawnSync("vercel", args, {
    encoding: "utf8",
    input,
    shell: process.platform === "win32",
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** Names only; `vercel env ls` never shows values. */
function listNames(env) {
  const { ok, output } = vercel(["env", "ls", env]);
  if (!ok) throw new Error(`Could not list ${env} variables:\n${output}`);
  return new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => /^[A-Z][A-Z0-9_]+$/.test(name)),
  );
}

const wanted = {};
for (const [env, path] of Object.entries(FILES)) {
  wanted[env] = parse(path);
  const placeholders = [...wanted[env]].filter(([, value]) => value.includes("[SENSITIVE]"));
  if (placeholders.length > 0) {
    throw new Error(`${path} holds redacted placeholders: ${placeholders.map(([name]) => name).join(", ")}`);
  }
}
if (wanted.production.get("NEXT_PUBLIC_ARC_NETWORK") !== "mainnet") {
  throw new Error("Production must set NEXT_PUBLIC_ARC_NETWORK=mainnet.");
}
if (wanted.preview.get("NEXT_PUBLIC_ARC_NETWORK") === "mainnet") {
  throw new Error("Preview must stay on testnet.");
}
// Mainnet and testnet must never share a database or Circle credentials.
if (!/^LIVE_API_KEY:/.test(wanted.production.get("CIRCLE_API_KEY") ?? "")) {
  throw new Error("Production CIRCLE_API_KEY must be a LIVE_API_KEY.");
}
if (/^LIVE_API_KEY:/.test(wanted.preview.get("CIRCLE_API_KEY") ?? "")) {
  throw new Error("Preview CIRCLE_API_KEY must be a TEST_API_KEY, not a live one.");
}
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CIRCLE_ENTITY_SECRET",
  "NEXT_PUBLIC_CIRCLE_APP_ID",
]) {
  if (wanted.production.get(name) && wanted.production.get(name) === wanted.preview.get(name)) {
    throw new Error(`${name} is the same in Production and Preview; they must be separate.`);
  }
}

const existing = { production: listNames("production"), preview: listNames("preview") };
for (const env of ["production", "preview"]) {
  const removed = [...existing[env]].filter((name) => !wanted[env].has(name));
  console.log(`${env}: ${existing[env].size} now → ${wanted[env].size} from ${FILES[env]}`);
  console.log(`  dropped: ${removed.join(" ") || "none"}`);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to change Vercel.");
  process.exit(0);
}

let failed = 0;
// Clear both first, so a variable shared by both environments cannot keep
// one environment's value in the other.
for (const env of ["production", "preview"]) {
  for (const name of existing[env]) vercel(["env", "rm", name, env, "--yes"]);
}
for (const env of ["production", "preview"]) {
  for (const [name, value] of wanted[env]) {
    const added = vercel(["env", "add", name, env, "--force"], value);
    if (!added.ok) {
      failed += 1;
      console.error(`FAIL ${env} ${name}\n${added.output.split("\n").slice(-3).join("\n")}`);
    }
  }
  const now = listNames(env);
  const missing = [...wanted[env].keys()].filter((name) => !now.has(name));
  console.log(`${env}: ${now.size} set${missing.length ? `, MISSING ${missing.join(" ")}` : ""}`);
  failed += missing.length;
}

console.log(failed ? `\n${failed} problem(s) — see above.` : "\nBoth environments match their files.");
process.exit(failed ? 1 : 0);
