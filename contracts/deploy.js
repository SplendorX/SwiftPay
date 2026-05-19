import dotenv from "dotenv";
dotenv.config();

import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import fs from "fs";

const client = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const abiJson = JSON.parse(fs.readFileSync("./abi.json", "utf8"));
const bytecode = fs.readFileSync("./bytecode.txt", "utf8").trim();

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
      "0x3600000000000000000000000000000000000000"
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