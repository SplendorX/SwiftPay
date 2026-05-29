export const platformAnalyticsUpdatedEvent = "swiftpay:analytics-updated";

export const platformPaymentEventTypes = [
  "direct_send",
  "payment_request",
  "swap",
  "private_send",
  "payroll",
  "claim",
] as const;

export const platformProfileCreationEventType = "profile_creation" as const;

export const platformAnalyticsEventTypes = [
  ...platformPaymentEventTypes,
  platformProfileCreationEventType,
] as const;

export type PlatformPaymentEventType =
  (typeof platformPaymentEventTypes)[number];

export type PlatformAnalyticsEventType =
  (typeof platformAnalyticsEventTypes)[number];

export type PlatformAnalyticsEventInput = {
  amount?: string;
  counterpartyAddress?: string;
  eventType: PlatformAnalyticsEventType;
  metadata?: Record<string, unknown>;
  token?: string;
  txHash?: string;
  walletAddress?: string;
};

export type PlatformAnalyticsServiceSummary = {
  count: number;
  eventType: PlatformPaymentEventType;
  share: number;
  volume: number;
};

export type PlatformAnalyticsTrendPoint = {
  count: number;
  label: string;
  volume: number;
};

export type PlatformAnalyticsSummary = {
  generatedAt: string;
  rails: Array<{
    count: number;
    symbol: string;
    volume: number;
  }>;
  services: PlatformAnalyticsServiceSummary[];
  totals: {
    activeRails: number;
    paymentEvents: number;
    paymentServices: number;
    profileCreations: number;
    totalVolume: number;
  };
  trend: PlatformAnalyticsTrendPoint[];
};

type PlatformPaymentEventInput = Omit<
  PlatformAnalyticsEventInput,
  "eventType"
> & {
  eventType: PlatformPaymentEventType;
};

type PlatformProfileCreationInput = {
  metadata?: Record<string, unknown>;
  profileId?: string;
  provider?: string;
  walletAddress?: string;
};

function recordPlatformAnalyticsEvent(
  input: PlatformAnalyticsEventInput,
  storageKey: string,
) {
  if (typeof window === "undefined") {
    return;
  }

  if (storageKey && window.localStorage.getItem(storageKey)) {
    return;
  }

  void fetch("/api/analytics", {
    body: JSON.stringify(input),
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
    method: "POST",
  })
    .then(async (response) => {
      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { recorded?: boolean }
        | null;

      if (payload?.recorded === false) {
        return;
      }

      if (storageKey) {
        window.localStorage.setItem(storageKey, "1");
      }

      window.dispatchEvent(new CustomEvent(platformAnalyticsUpdatedEvent));
    })
    .catch(() => undefined);
}

export function recordPlatformPaymentEvent(input: PlatformPaymentEventInput) {
  const txHash = input.txHash?.trim();
  const storageKey = txHash
    ? `swiftpay.analytics.recorded.${input.eventType}.${txHash.toLowerCase()}`
    : "";

  recordPlatformAnalyticsEvent(input, storageKey);
}

export function recordPlatformProfileCreation(
  input: PlatformProfileCreationInput,
) {
  if (typeof window === "undefined") {
    return;
  }

  const profileId = input.profileId?.trim() || input.walletAddress?.trim();

  if (!profileId) {
    return;
  }

  const provider = input.provider?.trim() || "profile";
  const storageKey = `swiftpay.analytics.profileCreation.${encodeURIComponent(
    provider.toLowerCase(),
  )}.${encodeURIComponent(profileId.toLowerCase())}`;

  recordPlatformAnalyticsEvent(
    {
      eventType: platformProfileCreationEventType,
      metadata: {
        ...input.metadata,
        provider,
      },
      walletAddress: input.walletAddress,
    },
    storageKey,
  );
}
