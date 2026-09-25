/**
 * USD value of a stablecoin amount, for rewards priced in USD: referral
 * volume and transaction cashback tiers. USDC counts 1:1; EURC counts at the
 * live EUR→USD rate, so a EURC payment earns the same as a USDC payment of
 * equal value.
 *
 * Same source as the in-app currency display (lib/use-conversion-rates.ts).
 */
const ratesEndpoint = "https://open.er-api.com/v6/latest/USD";
const cacheTtlMs = 10 * 60 * 1_000;
/** EUR→USD has stayed well inside this band; anything outside is bad data. */
const saneUsdPerEur = { min: 0.5, max: 2 };

let cached: { usdPerEur: number; fetchedAt: number } | null = null;

async function fetchUsdPerEur(): Promise<number | null> {
  try {
    const response = await fetch(ratesEndpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { rates?: Record<string, number> };
    const eurPerUsd = payload.rates?.EUR;
    if (typeof eurPerUsd !== "number" || !(eurPerUsd > 0)) return null;
    const usdPerEur = 1 / eurPerUsd;
    return usdPerEur >= saneUsdPerEur.min && usdPerEur <= saneUsdPerEur.max
      ? usdPerEur
      : null;
  } catch {
    return null;
  }
}

/**
 * Live USD per EUR, cached for ten minutes. When the rate service is down it
 * falls back to the last good rate, then to 1:1 — the old face-value rule,
 * which undercounts EURC slightly rather than overcounting it.
 */
export async function usdPerEur() {
  if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
    return cached.usdPerEur;
  }
  const fresh = await fetchUsdPerEur();
  if (fresh) {
    cached = { usdPerEur: fresh, fetchedAt: Date.now() };
    return fresh;
  }
  return cached?.usdPerEur ?? 1;
}

export async function stablecoinUsdValue(amount: number, token: string | null | undefined) {
  if (token?.toUpperCase() === "EURC") {
    return amount * (await usdPerEur());
  }
  return amount;
}
