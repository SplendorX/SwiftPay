import { circleErrors } from "@/lib/swift-circle/errors";

type RateBucket = "CHAT" | "MEMBERSHIP" | "PAYMENT" | "REQUEST" | "SAVE" | "EARN" | "WITHDRAWAL" | "APPROVAL";

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

const limits: Record<RateBucket, { max: number; windowMs: number }> = {
  CHAT: { max: 60, windowMs: 60_000 },
  MEMBERSHIP: { max: 30, windowMs: 60_000 },
  PAYMENT: { max: 10, windowMs: 60_000 },
  REQUEST: { max: 20, windowMs: 60_000 },
  SAVE: { max: 10, windowMs: 60_000 },
  EARN: { max: 10, windowMs: 60_000 },
  WITHDRAWAL: { max: 5, windowMs: 60_000 },
  APPROVAL: { max: 20, windowMs: 60_000 },
};

export function consumeCircleRateLimit(input: {
  bucket: RateBucket;
  wallet: string;
}) {
  const spec = limits[input.bucket];
  const key = `${input.bucket}:${input.wallet.toLowerCase()}`;
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + spec.windowMs });
    return;
  }
  if (current.count >= spec.max) {
    throw circleErrors.rateLimited();
  }
  current.count += 1;
}
