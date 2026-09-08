import { defineConfig } from "hardhat/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [hardhatVerify],
  solidity: "0.8.28",
  networks: {
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts: process.env.SEPOLIA_DEPLOYER_KEY ? [process.env.SEPOLIA_DEPLOYER_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
});
