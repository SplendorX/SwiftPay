import { config as dotenvConfig } from "dotenv";
dotenvConfig();

export default {
  solidity: "0.8.20",
  networks: {
    arcTestnet: {
      type: "http",
      url: process.env.ARC_TESTNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};