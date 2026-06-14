import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function run() {
  const walletSet = await client.createWalletSet({
    name: "MyWalletSet",
  });

  const wallet = await client.createWallets({
    blockchains: ["ARC-TESTNET"],
    count: 1,
    walletSetId: walletSet.data.walletSet.id,
  });

  console.log(JSON.stringify(wallet.data.wallets, null, 2));
}

run();
