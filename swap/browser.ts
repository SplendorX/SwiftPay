import type { ArcTokenSymbol } from "@/lib/tokens";
import { arcTestnet } from "@/lib/wagmi";

type Eip1193Provider = {
  on: <TEvent extends string>(
    event: TEvent,
    listener: (...args: unknown[]) => void,
  ) => void;
  request: <TReturn = unknown>(args: {
    method: string;
    params?: unknown;
  }) => Promise<TReturn>;
  removeListener: <TEvent extends string>(
    event: TEvent,
    listener: (...args: unknown[]) => void,
  ) => void;
};

type WalletConnector = {
  getProvider?: (parameters?: { chainId?: number }) => Promise<unknown> | unknown;
};

type SwapRequest = {
  amountIn: string;
  connector: WalletConnector | undefined;
  slippageBps: number;
  stopLimit?: string;
  tokenIn: ArcTokenSymbol;
  tokenOut: ArcTokenSymbol;
};

export type CircleSwapEstimate = {
  estimatedOutput: string;
  estimatedOutputAmount: string;
  fees: string[];
  minimumOutput: string;
  stopLimitAmount: string;
};

export type CircleSwapExecution = {
  amountOut?: string;
  explorerUrl?: string;
  txHash: string;
};

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const ARC_TESTNET_CHAIN_ID_HEX = `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`;
const CIRCLE_API_ORIGIN = "https://api.circle.com";

async function getBrowserProvider(connector: WalletConnector | undefined) {
  const provider = connector?.getProvider
    ? await connector.getProvider({ chainId: ARC_TESTNET_CHAIN_ID })
    : undefined;

  const fallbackProvider =
    typeof window !== "undefined"
      ? (window as Window & { ethereum?: unknown }).ethereum
      : undefined;

  const resolvedProvider = provider ?? fallbackProvider;

  const candidate = resolvedProvider as Partial<Eip1193Provider>;

  if (!resolvedProvider || typeof candidate.request !== "function") {
    throw new Error("Connect an EIP-1193 wallet before swapping.");
  }

  const browserProvider = {
    on:
      typeof candidate.on === "function"
        ? candidate.on.bind(resolvedProvider)
        : () => undefined,
    request: async <TReturn = unknown>(args: {
      method: string;
      params?: unknown;
    }) =>
      (await candidate.request?.call(resolvedProvider, args)) as TReturn,
    removeListener:
      typeof candidate.removeListener === "function"
        ? candidate.removeListener.bind(resolvedProvider)
        : () => undefined,
  } satisfies Eip1193Provider;

  const providerChainId = await browserProvider.request<string>({
    method: "eth_chainId",
  });

  if (providerChainId.toLowerCase() !== ARC_TESTNET_CHAIN_ID_HEX) {
    throw new Error("Switch your wallet to Arc Testnet before swapping.");
  }

  return browserProvider;
}

function getCircleKitKey() {
  return (
    process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY ??
    "KIT_KEY:swiftpay-proxy:browser"
  );
}

function buildSwapConfig(slippageBps: number, stopLimit?: string) {
  const kitKey = getCircleKitKey();

  return {
    allowanceStrategy: "approve" as const,
    kitKey,
    slippageBps,
    ...(stopLimit ? { stopLimit } : {}),
  };
}

async function withCircleStablecoinProxy<TResult>(
  operation: () => Promise<TResult>,
) {
  if (typeof window === "undefined") {
    return operation();
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(
      request?.url ?? input.toString(),
      window.location.origin,
    );

    if (
      url.origin === CIRCLE_API_ORIGIN &&
      url.pathname.startsWith("/v1/stablecoinKits/swap")
    ) {
      const proxyUrl = `/api/circle${url.pathname}${url.search}`;

      return originalFetch(proxyUrl, {
        ...init,
        body: init?.body ?? request?.body ?? undefined,
        headers: init?.headers ?? request?.headers,
        method: init?.method ?? request?.method,
      });
    }

    return originalFetch(input, init);
  };

  try {
    return await operation();
  } finally {
    window.fetch = originalFetch;
  }
}

async function buildSwapParams(request: SwapRequest) {
  const [
    { AppKit, SwapChain },
    { createViemAdapterFromProvider },
    { createPublicClient, http },
  ] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
    import("viem"),
  ]);
  const adapter = await createViemAdapterFromProvider({
    capabilities: { addressContext: "user-controlled" },
    getPublicClient: () =>
      createPublicClient({
        chain: arcTestnet,
        transport: http(arcTestnet.rpcUrls.default.http[0]),
      }),
    provider: await getBrowserProvider(request.connector),
  });
  const kit = new AppKit();

  return {
    kit,
    params: {
      amountIn: request.amountIn,
      config: buildSwapConfig(request.slippageBps, request.stopLimit),
      from: { adapter, chain: SwapChain.Arc_Testnet },
      tokenIn: request.tokenIn,
      tokenOut: request.tokenOut,
    },
  };
}

export async function estimateCircleSwap(
  request: SwapRequest,
): Promise<CircleSwapEstimate> {
  const { kit, params } = await buildSwapParams(request);
  const estimate = await withCircleStablecoinProxy(() =>
    kit.estimateSwap(params),
  );

  return {
    estimatedOutput: `${estimate.estimatedOutput.amount} ${estimate.estimatedOutput.token}`,
    estimatedOutputAmount: estimate.estimatedOutput.amount,
    fees:
      estimate.fees?.map((fee) => `${fee.amount} ${fee.token} ${fee.type}`) ??
      [],
    minimumOutput: `${estimate.stopLimit.amount} ${estimate.stopLimit.token}`,
    stopLimitAmount: estimate.stopLimit.amount,
  };
}

export async function executeCircleSwap(
  request: SwapRequest,
): Promise<CircleSwapExecution> {
  const { kit, params } = await buildSwapParams(request);
  const result = await withCircleStablecoinProxy(() => kit.swap(params));

  return {
    amountOut: result.amountOut,
    explorerUrl: result.explorerUrl,
    txHash: result.txHash,
  };
}
