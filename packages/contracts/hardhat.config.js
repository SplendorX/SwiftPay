import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";

dotenvConfig({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

export default {
  solidity: {
    version: "0.8.20",
    settings: {
      evmVersion: "paris",
    },
  },
  networks: {
    arcTestnet: {
      type: "http",
      url: process.env.ARC_TESTNET_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
