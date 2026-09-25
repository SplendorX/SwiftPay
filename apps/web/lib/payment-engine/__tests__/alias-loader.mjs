/**
 * Resolves the `@/*` tsconfig path alias (and extensionless TS imports) so
 * `node --test` can exercise the real engine modules instead of copies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const candidates = (target) => [
  target,
  `${target}.ts`,
  `${target}.tsx`,
  path.join(target, "index.ts"),
  path.join(target, "index.tsx"),
];

function firstExisting(target) {
  return candidates(target).find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = firstExisting(path.join(appRoot, specifier.slice(2)));

    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const resolved = firstExisting(path.resolve(base, specifier));

    if (resolved && /\.tsx?$/.test(resolved)) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}

/** Next.js imports JSON without `with { type: "json" }`; so may the tests. */
export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    return nextLoad(url, { ...context, importAttributes: { type: "json" } });
  }
  return nextLoad(url, context);
}
