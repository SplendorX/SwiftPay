import type { EarnApiError, EarnVault } from "@/lib/earn/types";

async function readEarnResponse<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as
    | (T & EarnApiError)
    | EarnApiError
    | null;
  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json && json.error
        ? String(json.error)
        : "Earn request failed.";
    throw new Error(message);
  }
  return json as T;
}

export async function fetchEarnVaults(): Promise<{
  vaults: EarnVault[];
}> {
  const response = await fetch("/api/earn/vaults", { cache: "no-store" });
  return readEarnResponse(response);
}

/**
 * Vault discovery is the only server-side Earn call left. Quotes, positions,
 * deposits, and withdrawals are signed by the connected wallet in the browser
 * — see `lib/earn/browser.ts`.
 */
