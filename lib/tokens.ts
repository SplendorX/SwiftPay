import type { Address } from "viem";

export const arcTestnetTokens = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000",
    decimals: 6,
    name: "USD Coin",
    symbol: "USDC",
  },
  EURC: {
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
    name: "Euro Coin",
    symbol: "EURC",
  },
} as const satisfies Record<
  string,
  {
    address: Address;
    decimals: number;
    name: string;
    symbol: string;
  }
>;

export type ArcTokenSymbol = keyof typeof arcTestnetTokens;

export const arcTokenSymbols = Object.keys(
  arcTestnetTokens,
) as ArcTokenSymbol[];
