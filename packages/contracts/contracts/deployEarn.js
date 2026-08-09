/**
 * Deploy SwiftPay Earn stack to Arc.
 *
 * Modes:
 * - simulation (default on testnet): MockAavePool + AaveUsdcYieldStrategy(isSimulation=true)
 * - live: verified Aave Pool + aToken from env (no invented addresses)
 *
 * Switch mainnet:
 *   EARN_NETWORK=arcMainnet \
 *   ARC_MAINNET_CHAIN_ID=... \
 *   ARC_MAINNET_RPC_URL=... \
 *   ARC_MAINNET_USDC=... \
 *   AAVE_POOL_ADDRESS_MAINNET=... \
 *   AAVE_ATOKEN_USDC_MAINNET=... \
 *   pnpm deploy:earn
 */

import { config as dotenvConfig } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import hre from "hardhat";

import {
  assertMainnetReady,
  getActiveNetwork,
} from "../config/networks.js";

dotenvConfig({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const { ethers } = await hre.network.connect();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function main() {
  const network = getActiveNetwork();
  assertMainnetReady(network);

  const [deployer] = await ethers.getSigners();
  const owner =
    process.env.EARN_VAULT_OWNER?.trim() || deployer.address;
  const feeRecipient =
    process.env.EARN_FEE_RECIPIENT?.trim() ||
    process.env.PLATFORM_FEE_RECIPIENT?.trim() ||
    owner;

  console.log("=== SwiftPay Earn Deploy ===");
  console.log("Network:", network.name, network.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Owner:", owner);
  console.log("Fee recipient:", feeRecipient);
  console.log("Aave mode:", network.aave.mode);

  let usdcAddress = network.usdc;
  if (!usdcAddress) {
    throw new Error("USDC address not configured for this network.");
  }

  // Local hardhat: mint mock USDC when not on Arc.
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  let mockUsdc = null;
  if (chainId === 31337 || process.env.EARN_USE_MOCK_USDC === "1") {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log("MockUSDC:", usdcAddress);
  }

  const Vault = await ethers.getContractFactory("SwiftPayVault");
  const vault = await Vault.deploy(
    usdcAddress,
    owner,
    feeRecipient,
    "SwiftPay Earn USDC",
    "spUSDC",
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("SwiftPayVault:", vaultAddress);

  let poolAddress = network.aave.pool;
  let aTokenAddress = network.aave.aToken;
  let isSimulation = network.aave.isSimulation;
  let mockPool = null;

  if (network.aave.mode !== "live") {
    if (network.key === "arcMainnet") {
      throw new Error("Refusing to deploy simulation strategy on mainnet.");
    }

    console.log("Deploying MockAavePool (simulation — no real economic yield)...");
    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    mockPool = await MockAavePool.deploy();
    await mockPool.waitForDeployment();
    poolAddress = await mockPool.getAddress();

    const tx = await mockPool.initReserve(usdcAddress);
    await tx.wait();
    aTokenAddress = await mockPool.aTokens(usdcAddress);
    isSimulation = true;
    console.log("MockAavePool:", poolAddress);
    console.log("Mock aToken:", aTokenAddress);
  } else {
    console.log("Using LIVE Aave addresses (verified via env):");
    console.log("  Pool:", poolAddress);
    console.log("  aToken:", aTokenAddress);
    isSimulation = false;
  }

  const Strategy = await ethers.getContractFactory("AaveUsdcYieldStrategy");
  const strategy = await Strategy.deploy(
    usdcAddress,
    poolAddress,
    aTokenAddress,
    vaultAddress,
    owner,
    isSimulation,
  );
  await strategy.waitForDeployment();
  const strategyAddress = await strategy.getAddress();
  console.log("AaveUsdcYieldStrategy:", strategyAddress);
  console.log("  isSimulation:", isSimulation);

  const setTx = await vault.setStrategy(strategyAddress);
  await setTx.wait();
  console.log("Vault strategy set.");

  const operator =
    process.env.SWIFTPAY_EARN_OPERATOR_ADDRESS?.trim() ||
    process.env.SWIFTPAY_RECURRING_OPERATOR_ADDRESS?.trim() ||
    owner;

  const Executor = await ethers.getContractFactory("EarnAutoSaveExecutor");
  const executor = await Executor.deploy(
    usdcAddress,
    vaultAddress,
    operator,
    owner,
  );
  await executor.waitForDeployment();
  const executorAddress = await executor.getAddress();
  console.log("EarnAutoSaveExecutor:", executorAddress);
  console.log("  operator:", operator);

  const deployment = {
    deployedAt: new Date().toISOString(),
    network: {
      key: network.key,
      name: network.name,
      chainId: network.chainId ?? chainId,
      isTestnet: network.isTestnet,
      explorer: network.explorer,
    },
    earnMode: isSimulation ? "simulation" : "live",
    disclaimer: isSimulation
      ? "Testnet Demo — no real economic yield. Simulation only."
      : "Live Aave USDC supply strategy. Yield is variable and not guaranteed.",
    addresses: {
      usdc: usdcAddress,
      vault: vaultAddress,
      strategy: strategyAddress,
      aavePool: poolAddress,
      aToken: aTokenAddress,
      autoSaveExecutor: executorAddress,
      autoSaveOperator: operator,
      mockAavePool: mockPool ? poolAddress : null,
      mockUsdc: mockUsdc ? usdcAddress : null,
      owner,
      feeRecipient,
    },
    envHints: {
      NEXT_PUBLIC_EARN_VAULT_ADDRESS: vaultAddress,
      NEXT_PUBLIC_EARN_STRATEGY_ADDRESS: strategyAddress,
      NEXT_PUBLIC_EARN_MODE: isSimulation ? "simulation" : "live",
      NEXT_PUBLIC_AAVE_POOL_ADDRESS: poolAddress,
      NEXT_PUBLIC_AAVE_ATOKEN_USDC: aTokenAddress,
      NEXT_PUBLIC_EARN_AUTOSAVE_EXECUTOR_ADDRESS: executorAddress,
    },
  };

  const outDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../deployments",
  );
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `earn-${network.key}-${Date.now()}.json`,
  );
  writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  writeFileSync(
    path.join(outDir, `earn-${network.key}-latest.json`),
    JSON.stringify(deployment, null, 2),
  );

  console.log("\n=== Deployment written ===");
  console.log(outFile);
  console.log("\nAdd to apps/web .env:");
  for (const [k, v] of Object.entries(deployment.envHints)) {
    console.log(`${k}=${v}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
