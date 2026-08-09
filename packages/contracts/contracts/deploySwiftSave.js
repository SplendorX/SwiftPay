/**
 * Deploy SwiftSaveVault (non-interest savings custody).
 *
 * Usage:
 *   pnpm --filter @swiftpay/contracts deploy:swiftsave
 *
 * Env:
 *   PRIVATE_KEY (deployer on arcTestnet)
 *   Optional: SWIFT_SAVE_OWNER, ARC_TESTNET_USDC, ARC_TESTNET_EURC
 *
 * Hardhat 3: must call hre.network.connect() before using ethers.
 */
import { config as dotenvConfig } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";

dotenvConfig({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const __dirname = dirname(fileURLToPath(import.meta.url));

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

async function main() {
  if (!process.env.PRIVATE_KEY?.trim()) {
    throw new Error(
      "PRIVATE_KEY is missing in the repo root .env. Hardhat needs it to deploy to arcTestnet.",
    );
  }

  // Hardhat 3: connect (or create) the network connection before ethers is available.
  const connection = await (hre.network.getOrCreate
    ? hre.network.getOrCreate()
    : hre.network.connect());
  const ethers = connection.ethers;
  const networkName =
    connection.networkName ||
    process.env.HARDHAT_NETWORK ||
    "arcTestnet";

  const signers = await ethers.getSigners();
  if (!signers.length) {
    throw new Error(
      "No deployer account. Set PRIVATE_KEY in the root .env (0x-prefixed hex).",
    );
  }

  const [deployer] = signers;
  const owner =
    process.env.SWIFT_SAVE_OWNER?.trim() ||
    process.env.EARN_VAULT_OWNER?.trim() ||
    deployer.address;

  const usdc =
    process.env.ARC_TESTNET_USDC?.trim() ||
    process.env.NEXT_PUBLIC_USDC_ADDRESS?.trim() ||
    ARC_TESTNET_USDC;
  const eurc =
    process.env.ARC_TESTNET_EURC?.trim() ||
    process.env.NEXT_PUBLIC_EURC_ADDRESS?.trim() ||
    ARC_TESTNET_EURC;

  console.log("Deploying SwiftSaveVault…");
  console.log("  network:", networkName);
  console.log("  deployer:", deployer.address);
  console.log("  owner:", owner);
  console.log("  tokens:", [usdc, eurc]);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  deployer balance:", ethers.formatEther(balance), "native");

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has zero balance on Arc Testnet. Fund it with gas (USDC is gas on Arc — get testnet funds first).`,
    );
  }

  const Vault = await ethers.getContractFactory("SwiftSaveVault");
  const vault = await Vault.deploy(owner, [usdc, eurc]);
  await vault.waitForDeployment();
  const address = await vault.getAddress();

  console.log("\nSwiftSaveVault deployed:", address);
  console.log("\nAdd to root .env (and restart the web app):");
  console.log(`NEXT_PUBLIC_SWIFT_SAVE_VAULT_ADDRESS=${address}`);

  const outDir = join(__dirname, "..", "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `swift-save-${networkName}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        network: networkName,
        vault: address,
        owner,
        tokens: [usdc, eurc],
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
      },
      null,
      2,
    ),
  );
  console.log("Wrote", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
