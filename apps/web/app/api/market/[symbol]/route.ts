import { type NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/** Market data for the stablecoins SaphraONE holds, from CoinGecko. */
const coinIds: Record<string, string> = { EURC: "euro-coin", USDC: "usd-coin" };
const rangeDays: Record<string, number> = { "1d": 1, "1w": 7, "1m": 30 };

const base = "https://api.coingecko.com/api/v3";

function headers(): HeadersInit {
  // Optional: a demo key lifts the shared free-tier rate limit.
  const key = process.env.COINGECKO_API_KEY?.trim();
  return key ? { accept: "application/json", "x-cg-demo-api-key": key } : { accept: "application/json" };
}

type CoinPayload = {
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    fully_diluted_valuation?: { usd?: number };
    price_change_percentage_24h?: number;
    circulating_supply?: number;
    total_supply?: number;
  };
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await context.params;
  const id = coinIds[symbol.toUpperCase()];
  if (!id) return jsonError("Unknown coin.", 404);

  const range = request.nextUrl.searchParams.get("range") ?? "1d";
  const days = rangeDays[range];
  if (!days) return jsonError("Range must be 1d, 1w or 1m.", 400);

  try {
    // Cached on the server, so every viewer shares one upstream call a minute.
    const [coinResponse, chartResponse] = await Promise.all([
      fetch(
        `${base}/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`,
        { headers: headers(), next: { revalidate: 60 } },
      ),
      fetch(`${base}/coins/${id}/market_chart?vs_currency=usd&days=${days}`, {
        headers: headers(),
        next: { revalidate: days === 1 ? 120 : 900 },
      }),
    ]);

    if (!coinResponse.ok || !chartResponse.ok) {
      return jsonError("Market data is unavailable right now.", 502);
    }

    const coin = (await coinResponse.json()) as CoinPayload;
    const chart = (await chartResponse.json()) as { prices?: [number, number][] };
    const market = coin.market_data ?? {};

    return jsonOk({
      symbol: symbol.toUpperCase(),
      price: market.current_price?.usd ?? null,
      change24h: market.price_change_percentage_24h ?? null,
      marketCap: market.market_cap?.usd ?? null,
      volume24h: market.total_volume?.usd ?? null,
      circulatingSupply: market.circulating_supply ?? null,
      totalSupply: market.total_supply ?? null,
      fullyDilutedValue: market.fully_diluted_valuation?.usd ?? null,
      // [timestamp ms, price usd]
      points: (chart.prices ?? []).filter(
        (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
      ),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return jsonError("Market data is unavailable right now.", 502);
  }
}
