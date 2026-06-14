import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "util";

const kit = new AppKit();

const swapUSDCtoEURC = async (): Promise<void> => {
  try {
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: process.env.PRIVATE_KEY as string,
    });

    console.log("---------------Starting Swapping---------------");

    const params = {
      from: { adapter, chain: "Arc_Testnet" },
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: "1.00",
      config: {
        kitKey: process.env.KIT_KEY as string,

        // 100 bps = 1%
        slippageBps: 100,

        customFee: {
          percentageBps: 10, // 0.1%
          recipientAddress: process.env.TREASURY_WALLET as string,
        },
      },
    };

    // Estimate first
    const estimate = await kit.estimateSwap(params);

    console.log("ESTIMATE", inspect(estimate, false, null, true));

    const output = Number(estimate.estimatedOutput);

    console.log("Estimated EURC:", output);

    if (output < 0.90) {
      console.log("Swap cancelled: output too low");
      return;
    }

    // Execute actual swap
    const result = await kit.swap(params);

    console.log("RESULT", inspect(result, false, null, true));
  } catch (err) {
    console.log("ERROR", inspect(err, false, null, true));
  }
};

void swapUSDCtoEURC();