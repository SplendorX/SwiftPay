import { network } from "hardhat";

async function main() {
  const operator =
    process.env.SWIFTPAY_RECURRING_OPERATOR_ADDRESS?.trim() ||
    process.env.PLATFORM_FEE_RECIPIENT?.trim();

  if (!operator) {
    throw new Error(
      "Set SWIFTPAY_RECURRING_OPERATOR_ADDRESS or PLATFORM_FEE_RECIPIENT before deploying.",
    );
  }

  const { viem } = await network.connect();
  const executor = await viem.sendDeploymentTransaction("SwiftRecurepayExecutor", [
    operator,
  ]);
  const address = executor.contract.address;

  console.log("SwiftRecurepayExecutor deployed:", address);
  console.log("Operator:", operator);
  console.log("Set NEXT_PUBLIC_SWIFTRECUREPAY_EXECUTOR_ADDRESS=", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});