import { AppKit, type BridgeParams } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const bridgeUSDC = async (): Promise<void> => {
  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.PRIVATE_KEY as string,
    });

    console.log("---------------Starting Bridging---------------");

    // Build params once
    const params: BridgeParams = {
      from: { adapter, chain: "Arbitrum_Sepolia" },
      to: { adapter, chain: "Arc_Testnet" },
      amount: "1.00",
      config: {
        customFee: {
          value: "0.01",
          recipientAddress: process.env.TREASURY_WALLET as string,
        },
      },
    };

    // Estimate first
    const estimate = await kit.estimateBridge(params);

    console.log("Estimated fees:", inspect(estimate.fees, false, null, true));

    const providerFee = Number(
      estimate.fees.find((fee) => fee.type === "provider")?.amount ?? 0
    );

    const gasFee = Number(
      estimate.fees.find((fee) => fee.type === "gas")?.amount ?? 0
    );

    const customFee = 0.01;
    const totalFees = providerFee + gasFee + customFee;

    console.log("Provider Fee:", providerFee);
    console.log("Gas Fee:", gasFee);
    console.log("Custom Fee:", customFee);
    console.log("Total Fees:", totalFees);

    // Safety check
    if (totalFees > 0.50) {
      console.log("Bridge cancelled: fees too high");
      return;
    }

    // Execute bridge
    const result = await kit.bridge(params);

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void bridgeUSDC();