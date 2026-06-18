import { OptionsController } from "@reown/appkit-controllers";
import { createAppKit, modal } from "@reown/appkit/react";
import UniversalProvider from "@walletconnect/universal-provider";

import {
  arcTestnet,
  metadata,
  networks,
  projectId,
  wagmiAdapter,
} from "@/lib/wagmi";

const silentWalletConnectLogger = {
  child: () => silentWalletConnectLogger,
  debug: () => undefined,
  error: () => undefined,
  fatal: () => undefined,
  info: () => undefined,
  trace: () => undefined,
  warn: () => undefined,
};

let initPromise: Promise<void> | null = null;

export type AppKitView = "Account" | "Connect" | "Networks";

export function ensureAppKitInitialized() {
  if (!initPromise) {
    initPromise = initializeAppKit();
  }

  return initPromise;
}

export async function openAppKit(options: { view: AppKitView }) {
  await ensureAppKitInitialized();

  if (!modal) {
    throw new Error("AppKit failed to initialize");
  }

  return modal.open(options);
}

async function initializeAppKit() {
  OptionsController.setEnableCoinbase(false);
  OptionsController.setEnableBaseAccount(false);

  const universalProvider = await UniversalProvider.init({
    logger: silentWalletConnectLogger as unknown as NonNullable<
      NonNullable<Parameters<typeof UniversalProvider.init>[0]>["logger"]
    >,
    metadata: {
      description: metadata.description,
      icons: metadata.icons,
      name: metadata.name,
      url: metadata.url,
    },
    projectId,
  });

  createAppKit({
    adapters: [wagmiAdapter],
    chainImages: {
      [arcTestnet.id]: arcTestnet.iconUrl,
    },
    debug: false,
    defaultNetwork: arcTestnet,
    enableBaseAccount: false,
    enableCoinbase: false,
    enableReconnect: false,
    features: {
      allWallets: true,
      analytics: false,
      email: false,
      onramp: false,
      socials: false,
      swaps: false,
    },
    metadata,
    networks,
    projectId,
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#5d22c6",
      "--w3m-border-radius-master": "2px",
    },
    universalProvider: universalProvider as unknown as NonNullable<
      Parameters<typeof createAppKit>[0]["universalProvider"]
    >,
  });
}