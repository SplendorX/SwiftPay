import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const WALLET_SET_ID = "c83589b5-7ec9-5afb-bda2-7172bcfedeba";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function main() {
  const users = [
    {
      name: "User One",
      refId: "swiftpay-user-001",
    },
    {
      name: "User Two",
      refId: "swiftpay-user-002",
    },
    {
      name: "User Three",
      refId: "swiftpay-user-003",
    },
  ];

  const response = await client.createWallets({
    walletSetId: WALLET_SET_ID,
    blockchains: ["ARC-TESTNET"],
    count: users.length,
    accountType: "EOA",
    metadata: users,
  });

  console.log(JSON.stringify(response.data, null, 2));
}

main().catch(console.error);