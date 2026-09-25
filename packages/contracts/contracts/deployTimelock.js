/**
 * Deploy the SwiftPay timelock that owns every contract.
 *
 *   SWIFTPAY_MULTISIG_ADDRESS   proposer and executor (required)
 *   SWIFTPAY_TIMELOCK_DELAY     seconds, default 172800 (48h)
 *   --mainnet                   use ARC_MAINNET_RPC_URL
 */
import dotenv from "dotenv";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isMainnetTarget } from "./governance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

async function main() {
  const mainnet = isMainnetTarget();
  const rpcUrl = mainnet ? process.env.ARC_MAINNET_RPC_URL : process.env.ARC_TESTNET_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const multisig = process.env.SWIFTPAY_MULTISIG_ADDRESS?.trim();
  const delay = Number(process.env.SWIFTPAY_TIMELOCK_DELAY || 48 * 60 * 60);

  if (!rpcUrl || !privateKey) {
    throw new Error(`Missing ${mainnet ? "ARC_MAINNET_RPC_URL" : "ARC_TESTNET_RPC_URL"} or PRIVATE_KEY.`);
  }
  if (!multisig || !ethers.isAddress(multisig)) {
    throw new Error("Set SWIFTPAY_MULTISIG_ADDRESS to the multisig that will run the timelock.");
  }
  if (!Number.isInteger(delay) || delay < 0) {
    throw new Error("SWIFTPAY_TIMELOCK_DELAY must be a whole number of seconds.");
  }
  if (mainnet && delay < 24 * 60 * 60) {
    throw new Error("Refusing a mainnet timelock delay under 24h.");
  }

  const artifact = JSON.parse(
    readFileSync(
      join(__dirname, "../artifacts/contracts/governance/SwiftPayTimelock.sol/SwiftPayTimelock.json"),
      "utf8",
    ),
  );
  const wallet = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(rpcUrl));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying SwiftPayTimelock from:", wallet.address);
  console.log("Multisig (proposer + executor):", multisig);
  console.log("Delay:", delay, "seconds");

  const timelock = await factory.deploy(delay, [multisig], [multisig]);
  await timelock.waitForDeployment();
  const address = await timelock.getAddress();

  console.log("SwiftPayTimelock deployed to:", address);
  console.log("\nUpdate your .env:");
  console.log(`SWIFTPAY_TIMELOCK_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error("Timelock deployment failed:", error);
  process.exit(1);
});
