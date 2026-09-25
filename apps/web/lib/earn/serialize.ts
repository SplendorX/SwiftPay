/**
 * Normalize SDK results for the UI.
 *
 * App Kit returns bigints for on-chain quantities. The Earn view models are
 * declared in strings, and bigints are not JSON-serializable, so both the
 * server route and the browser path run results through here.
 */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = toJsonSafe(nested);
    }
    return output;
  }
  return value;
}
