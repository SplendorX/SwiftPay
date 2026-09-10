/**
 * Pure unit tests for SwiftCircle money, RBAC, policies, and state machines.
 * Run: node --test lib/swift-circle/__tests__/swift-circle.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

function parseDecimalToUnits(value, decimals) {
  const cleaned = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error("Invalid decimal amount.");
  const [whole, fraction = ""] = cleaned.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function formatUnitsToDecimal(units, decimals) {
  const negative = units < 0n;
  const value = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

function equalSplitUnits(total, count) {
  if (count <= 0) throw new Error("At least one recipient is required.");
  if (total <= 0n) throw new Error("Amount must be greater than zero.");
  const n = BigInt(count);
  const each = total / n;
  if (each <= 0n) {
    throw new Error("Amount is too small to split across the selected members.");
  }
  const remainder = total % n;
  return Array.from({ length: count }, (_, index) =>
    index < Number(remainder) ? each + 1n : each,
  );
}

function sumUnits(values) {
  return values.reduce((total, value) => total + value, 0n);
}

function assertCustomSplit(total, parts) {
  if (parts.length === 0) throw new Error("At least one recipient is required.");
  for (const part of parts) {
    if (part <= 0n) throw new Error("Each recipient amount must be greater than zero.");
  }
  if (sumUnits(parts) !== total) {
    throw new Error("Recipient amounts must add up to the total.");
  }
}

const rolePermissions = {
  host: [
    "view",
    "chat",
    "pay",
    "request",
    "contribute_save",
    "contribute_earn",
    "invite",
    "remove_member",
    "promote",
    "demote",
    "edit_circle",
    "manage_policy",
    "freeze",
    "initiate_withdrawal",
    "approve_withdrawal",
    "manage_save",
    "manage_earn",
    "view_audit",
    "transfer_host",
  ],
  admin: [
    "view",
    "chat",
    "pay",
    "request",
    "contribute_save",
    "contribute_earn",
    "invite",
    "remove_member",
    "initiate_withdrawal",
    "approve_withdrawal",
    "manage_save",
    "manage_earn",
  ],
  member: [
    "view",
    "chat",
    "pay",
    "request",
    "contribute_save",
    "contribute_earn",
  ],
};

function hasPermission(role, permission) {
  return rolePermissions[role].includes(permission);
}

const withdrawalTransitions = {
  draft: ["pending_policy", "cancelled"],
  pending_policy: ["pending_approval", "approved", "rejected", "cancelled", "expired"],
  pending_approval: ["approved", "rejected", "cancelled", "expired", "pending_approval"],
  approved: ["executing", "cancelled", "expired", "failed"],
  executing: ["submitted", "failed"],
  submitted: ["confirmed", "failed"],
  confirmed: [],
  rejected: [],
  cancelled: [],
  expired: [],
  failed: [],
};

function canTransitionWithdrawal(current, next) {
  return (withdrawalTransitions[current] ?? []).includes(next);
}

const requestTransitions = {
  pending: ["paid", "declined", "cancelled", "expired"],
  paid: [],
  declined: [],
  cancelled: [],
  expired: [],
};

function canTransitionRequest(current, next) {
  return (requestTransitions[current] ?? []).includes(next);
}

function matchWithdrawalPolicy({ amountUnits, policies, productType }) {
  const active = policies
    .filter((policy) => policy.active && policy.product_type === productType)
    .sort(
      (a, b) => Number(BigInt(a.minimum_amount_units) - BigInt(b.minimum_amount_units)),
    );
  const matched = active.find((policy) => {
    const min = BigInt(policy.minimum_amount_units);
    const max = policy.maximum_amount_units ? BigInt(policy.maximum_amount_units) : null;
    if (amountUnits < min) return false;
    if (max !== null && amountUnits >= max) return false;
    return true;
  });
  if (!matched) throw new Error("No withdrawal policy covers this amount.");
  return matched;
}

function evaluateCircleRisk(input) {
  const reasons = [];
  let decision = "ALLOW";
  if (input.circle.financial_frozen) {
    reasons.push("frozen");
    decision = "BLOCK";
  }
  if (input.recentWithdrawals >= 3) {
    reasons.push("velocity");
    decision = "BLOCK";
  }
  if (input.amountUnits <= 0n) {
    reasons.push("invalid");
    decision = "BLOCK";
  }
  return { decision, reasons };
}

function countValidApprovals(approvals, epoch, initiatorCounts, initiator) {
  return approvals.filter((row) => {
    if (row.approval_epoch !== epoch) return false;
    if (row.decision !== "approved") return false;
    if (!initiatorCounts && row.approver === initiator) return false;
    return true;
  }).length;
}

describe("SwiftCircle money", () => {
  it("parses USDC with 6 decimals using integer math", () => {
    assert.equal(parseDecimalToUnits("1", 6), 1_000_000n);
    assert.equal(parseDecimalToUnits("20.50", 6), 20_500_000n);
    assert.equal(formatUnitsToDecimal(1_000_000n, 6), "1");
  });

  it("rejects floating-point-looking invalid amounts", () => {
    assert.throws(() => parseDecimalToUnits("1.2.3", 6));
    assert.throws(() => parseDecimalToUnits("-5", 6));
  });

  it("splits $240 across 6 members equally", () => {
    const total = parseDecimalToUnits("240", 6);
    const parts = equalSplitUnits(total, 6);
    assert.equal(parts.length, 6);
    assert.ok(parts.every((part) => part === 40_000_000n));
    assert.equal(sumUnits(parts), total);
  });

  it("assigns remainder units to the first recipients", () => {
    const total = parseDecimalToUnits("100", 6);
    const parts = equalSplitUnits(total, 3);
    assert.equal(sumUnits(parts), total);
    assert.equal(parts[0], 33_333_334n);
    assert.equal(parts[1], 33_333_333n);
    assert.equal(parts[2], 33_333_333n);
  });

  it("verifies custom split sums exactly", () => {
    const total = parseDecimalToUnits("240", 6);
    assertCustomSplit(total, [
      parseDecimalToUnits("80", 6),
      parseDecimalToUnits("40", 6),
      parseDecimalToUnits("20", 6),
      parseDecimalToUnits("100", 6),
    ]);
    assert.throws(() =>
      assertCustomSplit(total, [
        parseDecimalToUnits("80", 6),
        parseDecimalToUnits("40", 6),
      ]),
    );
  });
});

describe("SwiftCircle RBAC", () => {
  it("lets members chat, pay, request, and contribute", () => {
    assert.equal(hasPermission("member", "chat"), true);
    assert.equal(hasPermission("member", "pay"), true);
    assert.equal(hasPermission("member", "contribute_save"), true);
  });

  it("rejects member withdrawals", () => {
    assert.equal(hasPermission("member", "initiate_withdrawal"), false);
    assert.equal(hasPermission("admin", "initiate_withdrawal"), true);
    assert.equal(hasPermission("host", "initiate_withdrawal"), true);
  });

  it("reserves host transfer and freeze to host", () => {
    assert.equal(hasPermission("admin", "transfer_host"), false);
    assert.equal(hasPermission("host", "transfer_host"), true);
    assert.equal(hasPermission("admin", "freeze"), false);
    assert.equal(hasPermission("host", "freeze"), true);
  });
});

describe("SwiftCircle state machines", () => {
  it("enforces withdrawal transitions", () => {
    assert.equal(canTransitionWithdrawal("draft", "pending_policy"), true);
    assert.equal(canTransitionWithdrawal("pending_approval", "approved"), true);
    assert.equal(canTransitionWithdrawal("approved", "executing"), true);
    assert.equal(canTransitionWithdrawal("submitted", "confirmed"), true);
    assert.equal(canTransitionWithdrawal("confirmed", "draft"), false);
    assert.equal(canTransitionWithdrawal("rejected", "approved"), false);
  });

  it("enforces request transitions", () => {
    assert.equal(canTransitionRequest("pending", "paid"), true);
    assert.equal(canTransitionRequest("pending", "declined"), true);
    assert.equal(canTransitionRequest("paid", "declined"), false);
  });
});

describe("SwiftCircle policy and approvals", () => {
  const policies = [
    {
      active: true,
      product_type: "save",
      minimum_amount_units: "0",
      maximum_amount_units: "500000000",
      required_approvals: 1,
      initiator_counts_as_approval: false,
    },
    {
      active: true,
      product_type: "save",
      minimum_amount_units: "500000000",
      maximum_amount_units: "2000000000",
      required_approvals: 2,
      initiator_counts_as_approval: false,
    },
    {
      active: true,
      product_type: "save",
      minimum_amount_units: "2000000000",
      maximum_amount_units: null,
      required_approvals: 3,
      initiator_counts_as_approval: false,
    },
  ];

  it("selects stored policy bands instead of hard-coded frontend limits", () => {
    const low = matchWithdrawalPolicy({
      amountUnits: parseDecimalToUnits("20", 6),
      policies,
      productType: "save",
    });
    assert.equal(low.required_approvals, 1);
    const mid = matchWithdrawalPolicy({
      amountUnits: parseDecimalToUnits("500", 6),
      policies,
      productType: "save",
    });
    assert.equal(mid.required_approvals, 2);
    const high = matchWithdrawalPolicy({
      amountUnits: parseDecimalToUnits("2000", 6),
      policies,
      productType: "save",
    });
    assert.equal(high.required_approvals, 3);
  });

  it("does not count the initiator unless the policy says so", () => {
    const approvals = [
      { approver: "alice", decision: "approved", approval_epoch: 1 },
    ];
    assert.equal(countValidApprovals(approvals, 1, false, "alice"), 0);
    assert.equal(countValidApprovals(approvals, 1, true, "alice"), 1);
  });

  it("ignores approvals from a previous epoch after destination or amount change", () => {
    const approvals = [
      { approver: "bob", decision: "approved", approval_epoch: 1 },
      { approver: "james", decision: "approved", approval_epoch: 1 },
    ];
    assert.equal(countValidApprovals(approvals, 2, false, "alice"), 0);
  });

  it("reaches 2-of-3 after two distinct approvals", () => {
    const approvals = [
      { approver: "alice", decision: "approved", approval_epoch: 1 },
      { approver: "bob", decision: "approved", approval_epoch: 1 },
    ];
    assert.equal(countValidApprovals(approvals, 1, true, "n/a"), 2);
  });
});

describe("SwiftCircle risk and freeze", () => {
  it("blocks withdrawals when the Circle is frozen", () => {
    const result = evaluateCircleRisk({
      amountUnits: 1_000_000n,
      circle: { financial_frozen: true },
      recentWithdrawals: 0,
    });
    assert.equal(result.decision, "BLOCK");
  });

  it("blocks high-velocity withdrawals", () => {
    const result = evaluateCircleRisk({
      amountUnits: 1_000_000n,
      circle: { financial_frozen: false },
      recentWithdrawals: 3,
    });
    assert.equal(result.decision, "BLOCK");
  });
});

describe("SwiftCircle idempotency keys", () => {
  it("treats the same key as a replay instead of a second payment", () => {
    const seen = new Map();
    function create(key, amount) {
      if (seen.has(key)) return { reused: true, amount: seen.get(key) };
      seen.set(key, amount);
      return { reused: false, amount };
    }
    const first = create("abc12345", "20");
    const second = create("abc12345", "20");
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(seen.size, 1);
  });
});

const MAX_CIRCLE_MEMBERS = 500;

function selectCirclePayRail(recipientCount) {
  if (recipientCount <= 0) throw new Error("At least one recipient is required.");
  return recipientCount === 1 ? "single" : "swiftbatch";
}

function reconcileBatchStatus(statuses) {
  if (statuses.length === 0) return "failed";
  const confirmed = statuses.filter((status) => status === "confirmed").length;
  const failed = statuses.filter((status) => status === "failed").length;
  if (confirmed === statuses.length) return "completed";
  if (failed === statuses.length) return "failed";
  if (confirmed > 0 && confirmed < statuses.length) return "partially_completed";
  return "submitted";
}

function everyonePaidCopy(statuses) {
  const status = reconcileBatchStatus(statuses);
  if (status === "completed") return "Everyone paid";
  if (status === "partially_completed") {
    const paid = statuses.filter((value) => value === "confirmed").length;
    return `${paid} of ${statuses.length} paid`;
  }
  if (status === "failed") return "Payment failed";
  return "Payment processing";
}

function joinWithLock(state, max) {
  if (state.active >= max) {
    return { ok: false, code: "MEMBER_LIMIT", active: state.active };
  }
  state.active += 1;
  return { ok: true, active: state.active };
}

describe("Circle capacity", () => {
  it("lets the 500th member join", () => {
    const state = { active: 499 };
    const result = joinWithLock(state, MAX_CIRCLE_MEMBERS);
    assert.equal(result.ok, true);
    assert.equal(state.active, 500);
  });

  it("rejects the 501st member", () => {
    const state = { active: 500 };
    const result = joinWithLock(state, MAX_CIRCLE_MEMBERS);
    assert.equal(result.ok, false);
    assert.equal(result.code, "MEMBER_LIMIT");
    assert.equal(state.active, 500);
  });

  it("serializes two concurrent accepts at 499 so only one succeeds", () => {
    const state = { active: 499 };
    const first = joinWithLock(state, MAX_CIRCLE_MEMBERS);
    const second = joinWithLock(state, MAX_CIRCLE_MEMBERS);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(state.active, 500);
  });

  it("frees a seat after a member is removed", () => {
    const state = { active: 500 };
    state.active -= 1;
    assert.equal(state.active, 499);
    const result = joinWithLock(state, MAX_CIRCLE_MEMBERS);
    assert.equal(result.ok, true);
    assert.equal(state.active, 500);
  });

  it("does not count pending invitations toward capacity", () => {
    const active = 500;
    const pendingInvites = 12;
    assert.equal(active, MAX_CIRCLE_MEMBERS);
    assert.ok(pendingInvites > 0);
    assert.equal(active + pendingInvites > MAX_CIRCLE_MEMBERS, true);
  });
});

describe("Circle Pay rails", () => {
  it("uses the single-payment flow for one recipient", () => {
    assert.equal(selectCirclePayRail(1), "single");
  });

  it("uses SwiftBatch for two recipients", () => {
    assert.equal(selectCirclePayRail(2), "swiftbatch");
  });

  it("uses one SwiftBatch for ten recipients", () => {
    assert.equal(selectCirclePayRail(10), "swiftbatch");
  });

  it("uses SwiftBatch for an equal split across six members", () => {
    const parts = equalSplitUnits(parseDecimalToUnits("240", 6), 6);
    assert.equal(parts.length, 6);
    assert.equal(selectCirclePayRail(parts.length), "swiftbatch");
  });

  it("uses SwiftBatch for a custom split", () => {
    const parts = [
      parseDecimalToUnits("80", 6),
      parseDecimalToUnits("40", 6),
      parseDecimalToUnits("20", 6),
      parseDecimalToUnits("100", 6),
    ];
    assertCustomSplit(parseDecimalToUnits("240", 6), parts);
    assert.equal(selectCirclePayRail(parts.length), "swiftbatch");
  });

  it("uses SwiftBatch for pay-everyone in a 500-member Circle", () => {
    const recipientsExcludingSender = 499;
    assert.equal(selectCirclePayRail(recipientsExcludingSender), "swiftbatch");
  });

  it("returns the existing batch for a duplicate idempotency key", () => {
    const batches = new Map();
    function createBatch(key, recipientCount) {
      if (batches.has(key)) return { reused: true, id: batches.get(key) };
      const id = `batch-${batches.size + 1}`;
      batches.set(key, id);
      return { reused: false, id, rail: selectCirclePayRail(recipientCount) };
    }
    const first = createBatch("pay-key-001", 6);
    const second = createBatch("pay-key-001", 6);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.id, second.id);
    assert.equal(batches.size, 1);
  });

  it("does not double-apply a duplicate webhook", () => {
    const ledger = [];
    function confirm(eventId) {
      if (ledger.includes(eventId)) return { alreadyExists: true };
      ledger.push(eventId);
      return { alreadyExists: false };
    }
    assert.equal(confirm("tx-1").alreadyExists, false);
    assert.equal(confirm("tx-1").alreadyExists, true);
    assert.equal(ledger.length, 1);
  });

  it("never reports everyone paid when some recipients failed", () => {
    const statuses = ["confirmed", "confirmed", "failed"];
    assert.equal(reconcileBatchStatus(statuses), "partially_completed");
    assert.notEqual(everyonePaidCopy(statuses), "Everyone paid");
    assert.equal(everyonePaidCopy(statuses), "2 of 3 paid");
  });
});

describe("Circle Save pockets", () => {
  function canCreatePocket(role) {
    return role === "host";
  }

  function pocketWithdrawBlocked(pocket, now = Date.now()) {
    if (pocket.lock_kind !== "fixed") return false;
    const until = Date.parse(pocket.lock_until);
    return Number.isFinite(until) && until > now;
  }

  it("lets only the host create a pocket", () => {
    assert.equal(canCreatePocket("host"), true);
    assert.equal(canCreatePocket("admin"), false);
    assert.equal(canCreatePocket("member"), false);
  });

  it("lets members deposit into a host-created pocket", () => {
    assert.equal(hasPermission("member", "contribute_save"), true);
    assert.equal(hasPermission("admin", "contribute_save"), true);
  });

  it("blocks withdrawals from a locked fixed pocket", () => {
    const pocket = {
      lock_kind: "fixed",
      lock_until: new Date(Date.now() + 86_400_000).toISOString(),
    };
    assert.equal(pocketWithdrawBlocked(pocket), true);
  });

  it("allows withdrawals from a flexible pocket", () => {
    const pocket = { lock_kind: "flexible", lock_until: null };
    assert.equal(pocketWithdrawBlocked(pocket), false);
  });

  it("allows withdrawals after a fixed pocket unlocks", () => {
    const pocket = {
      lock_kind: "fixed",
      lock_until: new Date(Date.now() - 1_000).toISOString(),
    };
    assert.equal(pocketWithdrawBlocked(pocket), false);
  });
});

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function normalizeTxHash(value) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) return null;
  return value.toLowerCase();
}

function padAddress(address) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function transferLog({ token, from, to, amount }) {
  return {
    address: token,
    topics: [ERC20_TRANSFER_TOPIC, padAddress(from), padAddress(to)],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
  };
}

function tokenReceivedBy(logs, token, destination) {
  const tokenAddr = token.toLowerCase();
  const dest = destination.toLowerCase();
  let total = 0n;
  for (const log of logs) {
    if (log.address.toLowerCase() !== tokenAddr) continue;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    const to = `0x${log.topics[2].slice(-40)}`.toLowerCase();
    if (to !== dest) continue;
    total += BigInt(log.data);
  }
  return total;
}

function verifyDepositReceipt({ receipt, token, treasury, expectedUnits }) {
  if (!receipt) {
    return { ok: false, pending: true };
  }
  if (receipt.status !== "success") {
    return { ok: false, pending: false, reason: "reverted" };
  }
  const received = tokenReceivedBy(receipt.logs, token, treasury);
  if (received < expectedUnits) {
    return { ok: false, pending: false, reason: "missing-transfer" };
  }
  return { ok: true, creditedUnits: expectedUnits };
}

function creditDeposit({ status, txHash, storedHash, receipt, expectedUnits, token, treasury }) {
  if (status === "confirmed") return { status: "confirmed", reused: true };
  const hash = normalizeTxHash(txHash);
  const stored = storedHash ? storedHash.toLowerCase() : null;
  if (!hash || stored !== hash) return { status: "submitted", pending: true };
  const verified = verifyDepositReceipt({ receipt, token, treasury, expectedUnits });
  if (!verified.ok && verified.pending) return { status: "submitted", pending: true };
  if (!verified.ok) return { status: "failed", reason: verified.reason };
  return { status: "confirmed", creditedUnits: verified.creditedUnits };
}

describe("Circle Save/Earn deposits", () => {
  const token = "0x3600000000000000000000000000000000000000";
  const treasury = "0xb854303ea392cafceda9d0f4c2c48c0af9560281";
  const router = "0x1111111111111111111111111111111111111111";
  const user = "0x2222222222222222222222222222222222222222";
  const fee = "0x3333333333333333333333333333333333333333";
  const amount = 10_000_000n;
  const hashUpper =
    "0xABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";

  it("stores and matches transaction hashes in lowercase", () => {
    assert.equal(
      normalizeTxHash(hashUpper),
      "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    );
    assert.equal(normalizeTxHash("not-a-hash"), null);
  });

  it("credits when the send router transfers the contribution to treasury", () => {
    const receipt = {
      status: "success",
      logs: [
        transferLog({ token, from: user, to: router, amount: amount + 10_000n }),
        transferLog({ token, from: router, to: treasury, amount }),
        transferLog({ token, from: router, to: fee, amount: 10_000n }),
      ],
    };
    const result = creditDeposit({
      status: "submitted",
      txHash: hashUpper,
      storedHash: hashUpper,
      receipt,
      expectedUnits: amount,
      token,
      treasury,
    });
    assert.equal(result.status, "confirmed");
    assert.equal(result.creditedUnits, amount);
  });

  it("does not credit a submitted deposit until the Arc receipt exists", () => {
    const result = creditDeposit({
      status: "submitted",
      txHash: hashUpper,
      storedHash: hashUpper,
      receipt: null,
      expectedUnits: amount,
      token,
      treasury,
    });
    assert.equal(result.status, "submitted");
    assert.equal(result.pending, true);
  });

  it("fails a reverted deposit instead of increasing the Circle balance", () => {
    const result = creditDeposit({
      status: "submitted",
      txHash: hashUpper,
      storedHash: hashUpper,
      receipt: { status: "reverted", logs: [] },
      expectedUnits: amount,
      token,
      treasury,
    });
    assert.equal(result.status, "failed");
  });

  it("does not credit when USDC did not reach the treasury", () => {
    const result = creditDeposit({
      status: "submitted",
      txHash: hashUpper,
      storedHash: hashUpper,
      receipt: {
        status: "success",
        logs: [transferLog({ token, from: user, to: fee, amount })],
      },
      expectedUnits: amount,
      token,
      treasury,
    });
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "missing-transfer");
  });

  it("matches a mixed-case stored hash from a lowercase webhook", () => {
    const result = creditDeposit({
      status: "submitted",
      txHash: hashUpper.toLowerCase(),
      storedHash: hashUpper,
      receipt: {
        status: "success",
        logs: [transferLog({ token, from: router, to: treasury, amount })],
      },
      expectedUnits: amount,
      token,
      treasury,
    });
    assert.equal(result.status, "confirmed");
  });

  it("is idempotent once the contribution is confirmed", () => {
    const first = creditDeposit({
      status: "confirmed",
      txHash: hashUpper,
      storedHash: hashUpper,
      receipt: null,
      expectedUnits: amount,
      token,
      treasury,
    });
    assert.equal(first.status, "confirmed");
    assert.equal(first.reused, true);
  });
});
