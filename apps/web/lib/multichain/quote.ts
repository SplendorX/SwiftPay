// Server-only. Live CCTP fees from Arc to another network, from Circle's IRIS API.
import { ARC_CCTP_DOMAIN, type MultichainChain } from "@/lib/multichain/chains";
import { isArcMainnet } from "@/lib/network";
import { quoteOutbound, type OutboundQuote } from "@/lib/multichain/rules";

type FeeRow = {
  finalityThreshold?: number;
  forwardFee?: { high?: number; low?: number; med?: number };
  minimumFee?: number;
};

type RouteFees = { fastFeeBps: number; forwardFeeUnits: bigint };

const cache = new Map<number, { at: number; fees: RouteFees }>();
const CACHE_MS = 60_000;
/** FAST transfers use the lower finality threshold. */
const FAST_FINALITY = 1000;

function irisBase() {
  return isArcMainnet() ? "https://iris-api.circle.com" : "https://iris-api-sandbox.circle.com";
}

/** Arc → `chain` fees. The `high` forward fee, so the quote never promises too much. */
export async function routeFees(chain: MultichainChain): Promise<RouteFees> {
  const cached = cache.get(chain.cctpDomain);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.fees;

  const response = await fetch(
    `${irisBase()}/v2/burn/USDC/fees/${ARC_CCTP_DOMAIN}/${chain.cctpDomain}?forward=true`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Circle fee lookup failed (${response.status}).`);
  const rows = (await response.json()) as FeeRow[];
  const row = rows.find((entry) => entry.finalityThreshold === FAST_FINALITY) ?? rows[0];
  if (!row) throw new Error("Circle returned no fees for this route.");
  const forward = row.forwardFee?.high ?? row.forwardFee?.med ?? 0;
  const fees = { fastFeeBps: Number(row.minimumFee ?? 0), forwardFeeUnits: BigInt(Math.ceil(forward)) };
  cache.set(chain.cctpDomain, { at: Date.now(), fees });
  return fees;
}

export async function quoteSend(chain: MultichainChain, amountUnits: bigint): Promise<OutboundQuote> {
  return quoteOutbound({ amountUnits, ...(await routeFees(chain)) });
}
