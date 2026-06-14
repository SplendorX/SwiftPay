import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const SOURCE_WALLET_ADDRESS = "0xe61d3795488c75970f8c1dd32333fe53c995f8a8";
const SOURCE_WALLET_BLOCKCHAIN = "ARC-TESTNET";

const DESTINATION_WALLET_ADDRESS = "0x43d3ec372cb6fc158d7bc78377042d01d3a3b790";
const DESTINATION_WALLET_ID = "3cc5aaf4-871a-51a0-ac5a-fac585bf0338";

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";
const TRANSFER_AMOUNT = "5";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function main() {
  const tx = await client.createTransaction({
    walletAddress: SOURCE_WALLET_ADDRESS,
    blockchain: SOURCE_WALLET_BLOCKCHAIN,
    destinationAddress: DESTINATION_WALLET_ADDRESS,
    tokenAddress: ARC_TESTNET_USDC,
    amount: [TRANSFER_AMOUNT],
    fee: {
      type: "level",
      config: {
        feeLevel: "MEDIUM",
      },
    },
  });

  const txId = tx.data?.id;

  console.log("Transfer started:");
  console.log(tx.data);

  if (!txId) throw new Error("No transaction ID");

  let state = "";

  while (state !== "COMPLETE") {
    await new Promise((r) => setTimeout(r, 3000));

    const status = await client.getTransaction({
      id: txId,
    });

    state = status.data?.transaction?.state || "";

    console.log("Current state:", state);

    if (
      state === "FAILED" ||
      state === "DENIED" ||
      state === "CANCELLED"
    ) {
      throw new Error(`Transfer failed: ${state}`);
    }
  }

  const balance = await client.getWalletTokenBalance({
    id: DESTINATION_WALLET_ID,
  });

  console.log("Recipient balance:");
  console.log(balance.data);
}

main().catch(console.error);