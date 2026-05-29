import { NextResponse, type NextRequest } from "next/server";

import {
  platformAnalyticsEventTypes,
  platformPaymentEventTypes,
  platformProfileCreationEventType,
  type PlatformAnalyticsEventInput,
  type PlatformAnalyticsEventType,
  type PlatformPaymentEventType,
  type PlatformAnalyticsServiceSummary,
  type PlatformAnalyticsSummary,
  type PlatformAnalyticsTrendPoint,
} from "@/lib/platform-analytics";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const analyticsTable =
  process.env.SUPABASE_ANALYTICS_TABLE ?? "platform_payment_events";
const serviceWeights = {
  claim: 10,
  direct_send: 24,
  payment_request: 18,
  payroll: 18,
  private_send: 14,
  swap: 16,
} satisfies Record<PlatformPaymentEventType, number>;

type AnalyticsEventRow = {
  amount?: number | string | null;
  created_at?: string | null;
  event_type?: string | null;
  token?: string | null;
};

function isAnalyticsEventType(value: unknown): value is PlatformAnalyticsEventType {
  return (
    typeof value === "string" &&
    platformAnalyticsEventTypes.includes(value as PlatformAnalyticsEventType)
  );
}

function isPaymentEventType(value: unknown): value is PlatformPaymentEventType {
  return (
    typeof value === "string" &&
    platformPaymentEventTypes.includes(value as PlatformPaymentEventType)
  );
}

function readAmount(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  if (typeof value === "string") {
    const amount = Number(value);

    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  return 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function createDefaultTrend(): PlatformAnalyticsTrendPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));

    return {
      count: 0,
      label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
      volume: 0,
    };
  });
}

function createDefaultSummary(): PlatformAnalyticsSummary {
  return {
    generatedAt: new Date().toISOString(),
    rails: [
      { count: 0, symbol: "USDC", volume: 0 },
      { count: 0, symbol: "EURC", volume: 0 },
    ],
    services: platformPaymentEventTypes.map((eventType) => ({
      count: 0,
      eventType,
      share: serviceWeights[eventType],
      volume: 0,
    })),
    totals: {
      activeRails: 2,
      paymentEvents: 0,
      paymentServices: platformPaymentEventTypes.length,
      profileCreations: 0,
      totalVolume: 0,
    },
    trend: createDefaultTrend(),
  };
}

function dayKey(value: Date) {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function summarizeRows(rows: AnalyticsEventRow[]): PlatformAnalyticsSummary {
  const summary = createDefaultSummary();
  const serviceMap = new Map(
    summary.services.map((service) => [service.eventType, service]),
  );
  const railMap = new Map(
    summary.rails.map((rail) => [rail.symbol, { ...rail }]),
  );
  const trendDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));

    return date;
  });
  const trendMap = new Map(
    trendDates.map((date) => [
      dayKey(date),
      {
        count: 0,
        label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(date),
        volume: 0,
      },
    ]),
  );
  let profileCreations = 0;

  rows.forEach((row) => {
    if (!isAnalyticsEventType(row.event_type)) {
      return;
    }

    if (row.event_type === platformProfileCreationEventType) {
      profileCreations += 1;
      return;
    }

    if (!isPaymentEventType(row.event_type)) {
      return;
    }

    const amount = readAmount(row.amount);
    const service = serviceMap.get(row.event_type);

    if (service) {
      service.count += 1;
      service.volume = roundMoney(service.volume + amount);
    }

    const symbol = row.token?.toUpperCase();

    if (symbol) {
      const rail = railMap.get(symbol) ?? { count: 0, symbol, volume: 0 };
      rail.count += 1;
      rail.volume = roundMoney(rail.volume + amount);
      railMap.set(symbol, rail);
    }

    if (row.created_at) {
      const date = new Date(row.created_at);
      const trend = trendMap.get(dayKey(date));

      if (trend) {
        trend.count += 1;
        trend.volume = roundMoney(trend.volume + amount);
      }
    }
  });

  const services = Array.from(serviceMap.values());
  const totalEvents = services.reduce((total, service) => total + service.count, 0);
  const totalVolume = roundMoney(
    services.reduce((total, service) => total + service.volume, 0),
  );
  const activeRails = Array.from(railMap.values()).filter(
    (rail) => rail.count > 0,
  );

  return {
    generatedAt: new Date().toISOString(),
    rails: activeRails.length > 0 ? activeRails : summary.rails,
    services: services.map((service) => ({
      ...service,
      share:
        totalEvents > 0
          ? Math.max(7, Math.round((service.count / totalEvents) * 100))
          : serviceWeights[service.eventType],
    })),
    totals: {
      activeRails: Math.max(activeRails.length, 2),
      paymentEvents: totalEvents,
      paymentServices: platformPaymentEventTypes.length,
      profileCreations,
      totalVolume,
    },
    trend: Array.from(trendMap.values()),
  };
}

function normalizeEventBody(body: PlatformAnalyticsEventInput) {
  if (!isAnalyticsEventType(body.eventType)) {
    return null;
  }

  return {
    amount: readAmount(body.amount),
    counterparty_address:
      typeof body.counterpartyAddress === "string"
        ? body.counterpartyAddress.trim() || null
        : null,
    event_type: body.eventType,
    metadata:
      body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    token:
      typeof body.token === "string" ? body.token.trim().toUpperCase() : null,
    tx_hash: typeof body.txHash === "string" ? body.txHash.trim() || null : null,
    wallet_address:
      typeof body.walletAddress === "string"
        ? body.walletAddress.trim() || null
        : null,
  };
}

export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from(analyticsTable)
      .select("event_type,amount,token,created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json(createDefaultSummary());
    }

    return NextResponse.json(summarizeRows(data ?? []));
  } catch {
    return NextResponse.json(createDefaultSummary());
  }
}

export async function POST(request: NextRequest) {
  let body: PlatformAnalyticsEventInput;

  try {
    body = (await request.json()) as PlatformAnalyticsEventInput;
  } catch {
    return NextResponse.json({ recorded: false });
  }

  const event = normalizeEventBody(body);

  if (!event) {
    return NextResponse.json({ recorded: false });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from(analyticsTable).insert(event);

    return NextResponse.json({ recorded: !error });
  } catch {
    return NextResponse.json({ recorded: false });
  }
}
