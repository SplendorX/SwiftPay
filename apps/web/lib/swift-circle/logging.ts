export function newRequestId() {
  return crypto.randomUUID();
}

export function logCircleEvent(input: {
  requestId?: string;
  userWallet?: string | null;
  circleId?: string | null;
  transactionId?: string | null;
  operation: string;
  idempotencyKey?: string | null;
  status: string;
  extra?: Record<string, unknown>;
}) {
  console.info(
    JSON.stringify({
      scope: "swift-circle",
      requestId: input.requestId ?? null,
      userWallet: input.userWallet ?? null,
      circleId: input.circleId ?? null,
      transactionId: input.transactionId ?? null,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey ?? null,
      status: input.status,
      timestamp: new Date().toISOString(),
      ...input.extra,
    }),
  );
}
