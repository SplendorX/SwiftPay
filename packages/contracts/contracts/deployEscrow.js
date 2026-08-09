import { ethers } from "ethers";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

async function main() {
  // ── 1. Load ABI + Bytecode from Hardhat artifacts ──
  const artifactPath = join(
    __dirname,
    "../artifacts/contracts/PrivSwiftPayEscrow.sol/PrivSwiftPayEscrow.json"
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  // ── 2. Connect to Arc Testnet ──
  const RPC_URL = process.env.ARC_TESTNET_RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const feeRecipient =
    process.env.PLATFORM_FEE_RECIPIENT?.trim() ||
    process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT?.trim();

  if (!RPC_URL || !PRIVATE_KEY) {
    throw new Error("Missing ARC_TESTNET_RPC_URL or PRIVATE_KEY in .env");
  }

  if (!feeRecipient || !ethers.isAddress(feeRecipient)) {
    throw new Error(
      "PLATFORM_FEE_RECIPIENT (or NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT) must be a valid address.",
    );
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deploying from wallet:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Wallet balance:", ethers.formatEther(balance), "ETH");
  console.log("Fee recipient (1%):", feeRecipient);

  // ── 3. Deploy PrivSwiftPayEscrow ──
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Deploying PrivSwiftPayEscrow...");
  const contract = await factory.deploy(feeRecipient);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ PrivSwiftPayEscrow deployed to:", address);
  console.log("\nUpdate your .env:");
  console.log(`NEXT_PUBLIC_PRIVSWIFTPAY_ESCROW_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT=${feeRecipient}`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
