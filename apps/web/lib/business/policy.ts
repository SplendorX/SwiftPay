import type { ApprovalTier } from "@/lib/business/types";

const defaultPolicy: ApprovalTier[] = [
  { up_to: "1000", required_approvals: 0 },
  { up_to: "10000", required_approvals: 1 },
  { up_to: null, required_approvals: 2 },
];

export function parseApprovalPolicy(value: unknown): ApprovalTier[] {
  if (!Array.isArray(value) || value.length === 0) {
    return defaultPolicy;
  }

  const tiers: ApprovalTier[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const required = Number(row.required_approvals);
    if (!Number.isInteger(required) || required < 0 || required > 10) {
      continue;
    }
    const upTo =
      row.up_to === null || row.up_to === undefined
        ? null
        : String(row.up_to).trim();
    if (upTo !== null && !/^\d+(\.\d+)?$/.test(upTo)) {
      continue;
    }
    tiers.push({ up_to: upTo, required_approvals: required });
  }

  return tiers.length > 0 ? tiers : defaultPolicy;
}

export function requiredApprovalsForAmount(
  policy: ApprovalTier[],
  amountDisplay: string,
) {
  const amount = Number(amountDisplay);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  const sorted = [...policy].sort((a, b) => {
    if (a.up_to === null) return 1;
    if (b.up_to === null) return -1;
    return Number(a.up_to) - Number(b.up_to);
  });

  for (const tier of sorted) {
    if (tier.up_to === null || amount <= Number(tier.up_to)) {
      return tier.required_approvals;
    }
  }

  return sorted[sorted.length - 1]?.required_approvals ?? 0;
}

export function defaultApprovalPolicy() {
  return defaultPolicy;
}
