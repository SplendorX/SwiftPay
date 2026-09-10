export class CircleHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly userMessage: string;

  constructor(input: {
    code: string;
    status: number;
    userMessage: string;
    cause?: string;
  }) {
    super(input.cause ?? input.userMessage);
    this.name = "CircleHttpError";
    this.code = input.code;
    this.status = input.status;
    this.userMessage = input.userMessage;
  }
}

export const circleErrors = {
  unauthorized: () =>
    new CircleHttpError({
      code: "UNAUTHORIZED",
      status: 401,
      userMessage: "You don’t have permission to perform this action.",
    }),
  forbidden: (message?: string) =>
    new CircleHttpError({
      code: "FORBIDDEN",
      status: 403,
      userMessage: message ?? "You don’t have permission to perform this action.",
    }),
  notFound: (entity = "Circle") =>
    new CircleHttpError({
      code: "NOT_FOUND",
      status: 404,
      userMessage: `${entity} was not found.`,
    }),
  invalid: (message: string) =>
    new CircleHttpError({
      code: "INVALID",
      status: 400,
      userMessage: message,
    }),
  frozen: () =>
    new CircleHttpError({
      code: "CIRCLE_FROZEN",
      status: 409,
      userMessage: "Financial operations are frozen for this Circle.",
    }),
  insufficientBalance: () =>
    new CircleHttpError({
      code: "INSUFFICIENT_BALANCE",
      status: 400,
      userMessage: "You don’t have enough USDC to complete this payment.",
    }),
  approvalRequired: () =>
    new CircleHttpError({
      code: "APPROVAL_REQUIRED",
      status: 409,
      userMessage: "This withdrawal requires additional approvals.",
    }),
  pending: () =>
    new CircleHttpError({
      code: "PENDING",
      status: 202,
      userMessage: "Your transaction is being processed.",
    }),
  providerUnavailable: (message?: string) =>
    new CircleHttpError({
      code: "PROVIDER_UNAVAILABLE",
      status: 503,
      userMessage:
        message ??
        "Transaction processing is temporarily unavailable. Your funds have not been marked as completed.",
    }),
  conflict: (message: string) =>
    new CircleHttpError({
      code: "CONFLICT",
      status: 409,
      userMessage: message,
    }),
  rateLimited: () =>
    new CircleHttpError({
      code: "RATE_LIMITED",
      status: 429,
      userMessage: "Too many attempts. Please wait and try again.",
    }),
  riskBlocked: (reason?: string) =>
    new CircleHttpError({
      code: "RISK_BLOCKED",
      status: 403,
      userMessage: reason ?? "This operation was blocked by risk checks.",
    }),
  memberLimit: (maxMembers: number) =>
    new CircleHttpError({
      code: "MEMBER_LIMIT",
      status: 409,
      userMessage: `Circle has reached its ${maxMembers}-member limit.`,
    }),
};

export function isCircleHttpError(error: unknown): error is CircleHttpError {
  if (error instanceof CircleHttpError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    status?: unknown;
    code?: unknown;
    userMessage?: unknown;
  };
  return (
    candidate.name === "CircleHttpError" &&
    typeof candidate.status === "number" &&
    typeof candidate.code === "string" &&
    typeof candidate.userMessage === "string"
  );
}

export function publicCircleError(error: unknown) {
  if (isCircleHttpError(error)) {
    return { message: error.userMessage, status: error.status, code: error.code };
  }
  const raw = error instanceof Error ? error.message : "";
  if (
    /does not exist|schema cache|could not find the table|could not find the '.*' column/i.test(
      raw,
    )
  ) {
    return {
      message:
        "Create SwiftCircle tables with packages/database/supabase/swift-circle.sql.",
      status: 500,
      code: "SCHEMA_MISSING",
    };
  }
  if (/permission denied/i.test(raw)) {
    return {
      message: "Supabase rejected access to SwiftCircle tables.",
      status: 500,
      code: "SCHEMA_PERMISSION",
    };
  }
  return {
    message: "Something went wrong. Please try again.",
    status: 500,
    code: "INTERNAL",
  };
}
