/**
 * Arc network + Aave address registry for SwiftPay Earn.
 *
 * RULES:
 * - Never invent Aave Pool / aToken addresses.
 * - Leave aave.pool / aave.aToken empty until official deployments are verified.
 * - Testnet without official Aave uses MockAavePool (simulation).
 * - Mainnet switches by setting env vars after Arc + Aave go live.
 */

function readAddress(value) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "0x" || /^0x0+$/i.test(trimmed)) {
    return null;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** @typedef {"simulation" | "live" | "unavailable"} EarnMode */

/**
 * @param {object} input
 * @returns {{ mode: EarnMode, pool: string | null, aToken: string | null, isSimulation: boolean }}
 */
export function resolveAaveConfig({ pool, aToken, forceSimulation }) {
  if (forceSimulation) {
    return { mode: "simulation", pool: null, aToken: null, isSimulation: true };
  }

  const resolvedPool = readAddress(pool);
  const resolvedAToken = readAddress(aToken);

  if (resolvedPool && resolvedAToken) {
    return {
      mode: "live",
      pool: resolvedPool,
      aToken: resolvedAToken,
      isSimulation: false,
    };
  }

  if (resolvedPool || resolvedAToken) {
    // Partial config is unsafe — treat as unavailable.
    return { mode: "unavailable", pool: null, aToken: null, isSimulation: false };
  }

  return { mode: "simulation", pool: null, aToken: null, isSimulation: true };
}

export const ARC_TESTNET = {
  key: "arcTestnet",
  name: "Arc Testnet",
  chainId: 5042002,
  rpcUrl:
    process.env.ARC_TESTNET_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() ||
    "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  isTestnet: true,
  /** Official Arc testnet USDC ERC-20 interface (6 decimals). */
  usdc: "0x3600000000000000000000000000000000000000",
  aave: resolveAaveConfig({
    pool: process.env.AAVE_POOL_ADDRESS_TESTNET || process.env.AAVE_POOL_ADDRESS,
    aToken:
      process.env.AAVE_ATOKEN_USDC_TESTNET || process.env.AAVE_ATOKEN_USDC,
    forceSimulation:
      process.env.EARN_FORCE_SIMULATION === "1" ||
      process.env.EARN_FORCE_SIMULATION === "true",
  }),
};

/**
 * Arc mainnet — addresses MUST come from official docs after launch.
 * Do not hardcode placeholders as live.
 */
export const ARC_MAINNET = {
  key: "arcMainnet",
  name: "Arc Mainnet",
  chainId: Number(process.env.ARC_MAINNET_CHAIN_ID || 0) || null,
  rpcUrl: process.env.ARC_MAINNET_RPC_URL?.trim() || null,
  explorer: process.env.ARC_MAINNET_EXPLORER?.trim() || null,
  isTestnet: false,
  usdc: readAddress(process.env.ARC_MAINNET_USDC || process.env.NEXT_PUBLIC_ARC_MAINNET_USDC),
  aave: resolveAaveConfig({
    pool: process.env.AAVE_POOL_ADDRESS_MAINNET,
    aToken: process.env.AAVE_ATOKEN_USDC_MAINNET,
    forceSimulation: false,
  }),
};

/**
 * Active network for deploy scripts.
 * EARN_NETWORK=arcTestnet | arcMainnet
 */
export function getActiveNetwork() {
  const key = (process.env.EARN_NETWORK || "arcTestnet").trim();
  if (key === "arcMainnet") {
    return ARC_MAINNET;
  }
  return ARC_TESTNET;
}

export function assertMainnetReady(network) {
  if (network.key !== "arcMainnet") return;
  if (!network.chainId || !network.rpcUrl || !network.usdc) {
    throw new Error(
      "Arc mainnet is not configured. Set ARC_MAINNET_CHAIN_ID, ARC_MAINNET_RPC_URL, ARC_MAINNET_USDC from official docs.",
    );
  }
  if (network.aave.mode !== "live") {
    throw new Error(
      "Aave is not live on Arc mainnet config. Set AAVE_POOL_ADDRESS_MAINNET and AAVE_ATOKEN_USDC_MAINNET only after official verification.",
    );
  }
}
