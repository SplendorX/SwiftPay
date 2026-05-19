import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { inspect } from "node:util";

const kit = new AppKit();

async function send() {
  const adapter = createViemAdapterFromPrivateKey({
    privateKey: process.env.PRIVATE_KEY as string,
  });

  const sendParams = {
    from: { adapter, chain: "Arc_Testnet" },
    to: "0x6aa30a03d7f0c7928cd9cacfd8c765fccb2efd77",
    amount: "1.00",
    token: "USDC",
  };

  const result = await kit.send(sendParams);
  console.log(inspect(result, false, null, true));
}

send();
