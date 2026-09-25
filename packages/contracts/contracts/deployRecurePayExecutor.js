/**
 * Deploy SwiftRecurepayExecutor (1% platform fee).
 * Hardhat 3: use ethers via network.connect() when available,
 * or standalone ethers like deploySwiftBatch.js.
 */
import dotenv from "dotenv";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

async function main() {
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL;
  const privateKey = process.env.PRIVATE_KEY;
  const operator =
    process.env.SWIFTPAY_RECURRING_OPERATOR_ADDRESS?.trim() ||
    process.env.PLATFORM_FEE_RECIPIENT?.trim() ||
    process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim();
  const feeRecipient =
    process.env.PLATFORM_FEE_RECIPIENT?.trim() ||
    process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim() ||
    operator;

  if (!rpcUrl || !privateKey) {
    throw new Error("Missing ARC_TESTNET_RPC_URL or PRIVATE_KEY.");
  }
  if (!operator || !ethers.isAddress(operator)) {
    throw new Error(
      "Set SWIFTPAY_RECURRING_OPERATOR_ADDRESS or PLATFORM_FEE_RECIPIENT.",
    );
  }
  if (!feeRecipient || !ethers.isAddress(feeRecipient)) {
    throw new Error("PLATFORM_FEE_RECIPIENT must be a valid address.");
  }

  const artifactPath = join(
    __dirname,
    "../artifacts/contracts/SwiftRecurepayExecutor.sol/SwiftRecurepayExecutor.json",
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
  );

  console.log("Deploying SwiftRecurepayExecutor from:", wallet.address);
  console.log("Operator:", operator);
  console.log("Fee recipient (1%):", feeRecipient);

  const contract = await factory.deploy(operator, feeRecipient);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("SwiftRecurepayExecutor deployed to:", address);
  console.log("\nUpdate your .env:");
  console.log(`NEXT_PUBLIC_SWIFTRECUREPAY_EXECUTOR_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error("SwiftRecurepayExecutor deployment failed:", error);
  process.exit(1);
});
