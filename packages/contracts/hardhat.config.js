import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "node:url";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";

dotenvConfig({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

const arcTestnetRpc =
  process.env.ARC_TESTNET_RPC_URL?.trim() || "https://rpc.testnet.arc.network";

const arcMainnetRpc = process.env.ARC_MAINNET_RPC_URL?.trim();
const arcMainnetChainId = Number(process.env.ARC_MAINNET_CHAIN_ID || 0);

export default {
  plugins: [hardhatVerify, hardhatEthers, hardhatMocha],
  solidity: {
    version: "0.8.30",
    settings: {
      evmVersion: "paris",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
    arcTestnet: {
      type: "http",
      url: arcTestnetRpc,
      chainId: 5042002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    ...(arcMainnetRpc && arcMainnetChainId
      ? {
          arcMainnet: {
            type: "http",
            url: arcMainnetRpc,
            chainId: arcMainnetChainId,
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
          },
        }
      : {}),
  },
  // Arc has no Etherscan; ArcScan is Blockscout. Verify there only, so
  // `hardhat verify` doesn't report Etherscan/Sourcify failures.
  verify: {
    blockscout: { enabled: true },
    etherscan: { enabled: false },
    sourcify: { enabled: false },
  },
  chainDescriptors: {
    5042002: {
      name: "Arc Testnet",
      blockExplorers: {
        // testnet.arcscan.app now 301-redirects here; point at it directly so
        // verification POSTs are not lost to the redirect.
        blockscout: {
          name: "Arc Testnet Explorer",
          url: "https://explorer.testnet.arc.io",
          apiUrl: "https://explorer.testnet.arc.io/api",
        },
      },
    },
  },
};