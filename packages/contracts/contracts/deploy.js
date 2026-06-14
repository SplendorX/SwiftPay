import dotenv from "dotenv";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const client = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const abiJson = JSON.parse(
  readFileSync(new URL("../abi.json", import.meta.url), "utf8"),
);
const bytecode = readFileSync(
  new URL("../bytecode.txt", import.meta.url),
  "utf8",
).trim();

async function deploy() {
  const response = await client.deployContract({
    name: "MerchantTreasury Contract",
    description: "USDC payment treasury",
    blockchain: "ARC-TESTNET",
    walletId: "f37f746f-6c2c-5dde-8d37-2ed76149e14a",
    abiJson: JSON.stringify(abiJson),
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`,
    constructorParameters: [
      "0x4752a1c96ae97086e84a292e03c4e13150e411f6",
      "0x3600000000000000000000000000000000000000",
    ],
    fee: {
      type: "level",
      config: {
        feeLevel: "MEDIUM",
      },
    },
  });

  console.log(response.data);
}

deploy();
