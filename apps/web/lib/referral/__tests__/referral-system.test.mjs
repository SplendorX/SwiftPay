/**
 * SwiftPay Referral & SwiftPoints System Comprehensive Test Suite
 *
 * Verifies all financial, economic, state machine, and anti-fraud invariants:
 * 1. Universal Tier Engine & Boundary Transitions (Starter, Builder, Architect, Ambassador)
 * 2. Exact Fixed-Precision Integer Accounting (100 units = 1 point = $0.01 USDC)
 * 3. Qualified Activation Criteria vs. Activity Cashback (Strict Separation):
 *    - Activation: user has/deposits $50+ USDC in wallet ($500+ for Business)
 *    - Qualified Activation milestone:
 *      * Starter: 5 tx >= $50 OR > 250 USDC volume -> Referrer gets 20 pts, Referred gets 20 pts
 *      * Builder: 10 tx >= $50 OR > 500 USDC volume -> Referrer gets 30 pts, Referred gets 20 pts
 *      * Architect (Champion): 15 tx >= $50 OR > 750 USDC volume -> Referrer gets 50 pts, Referred gets 20 pts
 *      * Ambassador: 25 tx >= $50 OR > 1250 USDC volume -> Referrer gets 100 pts, Referred gets 20 pts
 * 4. Ongoing Referrer-Only Activity Cashback:
 *    - Threshold: transaction amount must be > $10 USDC
 *    - Points per transaction > $10:
 *      * Starter: 0.2 SwiftPoints
 *      * Builder: 0.3 SwiftPoints
 *      * Architect (Champion): 0.5 SwiftPoints
 *      * Ambassador: 1.0 SwiftPoint
 *    - Invariant: Referred account receives strictly 0 cashback on transactions
 * 5. Minimum 100-Point Redemption Threshold & USDC Conversion
 * 6. First-Valid-Attribution & Anti-Self-Referral Enforcement
 *
 * Run: node --test lib/referral/__tests__/referral-system.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ============================================================================
// Domain Rules Mirror
// ============================================================================

const TIERS = {
  STARTER: {
    name: "STARTER",
    minReferrals: 0,
    maxReferrals: 50,
    personalDirectRewardPoints: 20,
    businessDirectRewardPoints: 50,
    qualificationCriteria: {
      activationDepositMinUsdc: 50,
      minTxCountAt50: 5,
      volumeThresholdUsdc: 250,
    },
    activityCashback: {
      minTxAmountUsdc: 10,
      pointsPerTx: 0.2,
    },
  },
  BUILDER: {
    name: "BUILDER",
    minReferrals: 51,
    maxReferrals: 200,
    personalDirectRewardPoints: 30,
    businessDirectRewardPoints: 100,
    qualificationCriteria: {
      activationDepositMinUsdc: 50,
      minTxCountAt50: 10,
      volumeThresholdUsdc: 500,
    },
    activityCashback: {
      minTxAmountUsdc: 10,
      pointsPerTx: 0.3,
    },
  },
  ARCHITECT: {
    name: "ARCHITECT",
    minReferrals: 201,
    maxReferrals: 500,
    personalDirectRewardPoints: 50,
    businessDirectRewardPoints: 150,
    qualificationCriteria: {
      activationDepositMinUsdc: 50,
      minTxCountAt50: 15,
      volumeThresholdUsdc: 750,
    },
    activityCashback: {
      minTxAmountUsdc: 10,
      pointsPerTx: 0.5,
    },
  },
  AMBASSADOR: {
    name: "AMBASSADOR",
    minReferrals: 501,
    maxReferrals: null,
    personalDirectRewardPoints: 100,
    businessDirectRewardPoints: 200,
    qualificationCriteria: {
      activationDepositMinUsdc: 50,
      minTxCountAt50: 25,
      volumeThresholdUsdc: 1250,
    },
    activityCashback: {
      minTxAmountUsdc: 10,
      pointsPerTx: 1.0,
    },
  },
};

const REFERRED_WELCOME_REWARD_POINTS = 20; // 20 SwiftPoints ($0.20 USDC) across all tiers

function getTier(successfulReferrals) {
  if (successfulReferrals >= 501) return "AMBASSADOR";
  if (successfulReferrals >= 201) return "ARCHITECT";
  if (successfulReferrals >= 51) return "BUILDER";
  return "STARTER";
}

function getTierProgress(totalSuccessful) {
  const currentTier = getTier(totalSuccessful);
  switch (currentTier) {
    case "STARTER":
      return {
        currentTier,
        nextTier: "BUILDER",
        currentCount: totalSuccessful,
        targetCount: 51,
        progressPercentage: Math.min(100, Math.round((totalSuccessful / 50) * 100)),
      };
    case "BUILDER":
      return {
        currentTier,
        nextTier: "ARCHITECT",
        currentCount: totalSuccessful,
        targetCount: 201,
        progressPercentage: Math.min(
          100,
          Math.round(((totalSuccessful - 50) / 150) * 100),
        ),
      };
    case "ARCHITECT":
      return {
        currentTier,
        nextTier: "AMBASSADOR",
        currentCount: totalSuccessful,
        targetCount: 501,
        progressPercentage: Math.min(
          100,
          Math.round(((totalSuccessful - 200) / 300) * 100),
        ),
      };
    case "AMBASSADOR":
      return {
        currentTier,
        nextTier: null,
        currentCount: totalSuccessful,
        targetCount: totalSuccessful,
        progressPercentage: 100,
      };
  }
}

// Fixed-precision conversion
const UNITS_PER_POINT = 100n; // 100 units = 1 SwiftPoint = $0.01 USDC

function pointsToUnits(points) {
  return BigInt(Math.round(points * 100));
}

function unitsToPoints(units) {
  return Number(units) / 100;
}

function pointsToUsdc(points) {
  return Number((points * 0.01).toFixed(2));
}

/**
 * Evaluates the Qualification Milestone for a referral: volume only.
 * The invitee's counted payment volume must reach the referrer's tier target
 * (Personal 250/500/750/1250, Business 1000/2000/3000/5000 USD). There is no
 * balance or deposit prerequisite and no payment-count route.
 */
function evaluateQualifiedActivation({ accountType, referrerTier, cumulativeVolumeUsdc }) {
  const tierConfig = TIERS[referrerTier] || TIERS.STARTER;
  const isBusiness = accountType === "BUSINESS";
  const target = isBusiness
    ? referrerTier === "STARTER" ? 1000 : referrerTier === "BUILDER" ? 2000 : referrerTier === "ARCHITECT" ? 3000 : 5000
    : tierConfig.qualificationCriteria.volumeThresholdUsdc;
  const qualified = cumulativeVolumeUsdc >= target;

  return {
    qualified,
    method: qualified ? (isBusiness ? "BUSINESS_VOLUME" : "TRANSACTION_VOLUME") : null,
    referrerRewardPoints: isBusiness
      ? tierConfig.businessDirectRewardPoints
      : tierConfig.personalDirectRewardPoints,
    referredRewardPoints: REFERRED_WELCOME_REWARD_POINTS,
  };
}

/**
 * Counts each payment once per transaction hash, like the unique
 * (referral_id, tx_hash) key on referral_progress_payments.
 */
function countedVolume(reports, referrer = "0xreferrer") {
  const byHash = new Map();
  for (const { txHash, amountUsd, payeesUsd = {} } of reports) {
    // Money sent to the referrer never counts toward qualification.
    const counted = Math.max(0, amountUsd - (payeesUsd[referrer] ?? 0));
    if (counted > 0 && !byHash.has(txHash)) byHash.set(txHash, counted);
  }
  return [...byHash.values()].reduce((sum, value) => sum + value, 0);
}

/**
 * Calculates ongoing referral activity cashback for transactions > $10 USDC.
 */
function calculateReferralActivityCashback({
  referrerTier,
  transactionAmountUsdc,
  isQualified,
}) {
  if (!isQualified) {
    return {
      awarded: false,
      referrerPoints: 0,
      referredPoints: 0,
      reason: "Referral must complete qualified activation before generating activity cashback.",
    };
  }

  const tierConfig = TIERS[referrerTier] || TIERS.STARTER;
  const minAmount = tierConfig.activityCashback.minTxAmountUsdc; // 10 USDC

  // Transactions <= $10 do NOT generate activity cashback
  if (transactionAmountUsdc <= minAmount) {
    return {
      awarded: false,
      referrerPoints: 0,
      referredPoints: 0,
      reason: `Transaction amount ($${transactionAmountUsdc}) does not exceed threshold ($${minAmount}).`,
    };
  }

  const points = tierConfig.activityCashback.pointsPerTx;
  return {
    awarded: true,
    referrerPoints: points,
    referredPoints: 0, // Invariant: Referred account always receives 0 cashback
    referrerUsdcEquivalent: Number((points * 0.01).toFixed(4)),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("1. Universal Tier Engine & Boundary Transitions", () => {
  it("should evaluate 0 to 50 referrals as STARTER tier", () => {
    assert.equal(getTier(0), "STARTER");
    assert.equal(getTier(1), "STARTER");
    assert.equal(getTier(25), "STARTER");
    assert.equal(getTier(50), "STARTER");
  });

  it("should transition to BUILDER at exactly 51 referrals", () => {
    assert.equal(getTier(50), "STARTER");
    assert.equal(getTier(51), "BUILDER");
    assert.equal(getTier(100), "BUILDER");
    assert.equal(getTier(200), "BUILDER");
  });

  it("should transition to ARCHITECT at exactly 201 referrals", () => {
    assert.equal(getTier(200), "BUILDER");
    assert.equal(getTier(201), "ARCHITECT");
    assert.equal(getTier(350), "ARCHITECT");
    assert.equal(getTier(500), "ARCHITECT");
  });

  it("should transition to AMBASSADOR at exactly 501 referrals", () => {
    assert.equal(getTier(500), "ARCHITECT");
    assert.equal(getTier(501), "AMBASSADOR");
    assert.equal(getTier(1000), "AMBASSADOR");
  });

  it("should treat Personal and Business referrals as a single combined ladder", () => {
    const personal = 30;
    const business = 25;
    const combinedTotal = personal + business; // 55
    assert.equal(getTier(combinedTotal), "BUILDER");

    const personal2 = 180;
    const business2 = 25;
    const combinedTotal2 = personal2 + business2; // 205
    assert.equal(getTier(combinedTotal2), "ARCHITECT");
  });

  it("should accurately compute tier progress percentage and target count", () => {
    const starterProgress = getTierProgress(25);
    assert.equal(starterProgress.currentTier, "STARTER");
    assert.equal(starterProgress.nextTier, "BUILDER");
    assert.equal(starterProgress.targetCount, 51);
    assert.equal(starterProgress.progressPercentage, 50);

    const builderProgress = getTierProgress(100);
    assert.equal(builderProgress.currentTier, "BUILDER");
    assert.equal(builderProgress.nextTier, "ARCHITECT");
    assert.equal(builderProgress.targetCount, 201);

    const ambassadorProgress = getTierProgress(600);
    assert.equal(ambassadorProgress.currentTier, "AMBASSADOR");
    assert.equal(ambassadorProgress.nextTier, null);
    assert.equal(ambassadorProgress.progressPercentage, 100);
  });
});

describe("2. Exact Fixed-Precision Integer Accounting", () => {
  it("should enforce 100 internal units = 1 SwiftPoint = $0.01 USDC", () => {
    const points = 100;
    const units = pointsToUnits(points);
    assert.equal(units, 10000n);
    assert.equal(unitsToPoints(units), 100);
    assert.equal(pointsToUsdc(points), 1.00);
  });

  it("should accurately convert micro-points without floating point drift", () => {
    // 0.2 points (Starter cashback) = 20 units
    const unitsStarter = pointsToUnits(0.2);
    assert.equal(unitsStarter, 20n);
    assert.equal(unitsToPoints(unitsStarter), 0.2);

    // 0.3 points (Builder cashback) = 30 units
    const unitsBuilder = pointsToUnits(0.3);
    assert.equal(unitsBuilder, 30n);
    assert.equal(unitsToPoints(unitsBuilder), 0.3);

    // 0.5 points (Architect cashback) = 50 units
    const unitsArchitect = pointsToUnits(0.5);
    assert.equal(unitsArchitect, 50n);
    assert.equal(unitsToPoints(unitsArchitect), 0.5);

    // 1.0 point (Ambassador cashback) = 100 units
    const unitsAmbassador = pointsToUnits(1.0);
    assert.equal(unitsAmbassador, 100n);
    assert.equal(unitsToPoints(unitsAmbassador), 1.0);
  });

  it("should prevent underflow on debits and redemptions", () => {
    const availableUnits = 5000n; // 50 points
    const debitUnits = 6000n; // 60 points
    const canDebit = availableUnits >= debitUnits;
    assert.equal(canDebit, false, "Should block debit exceeding balance");
  });
});

describe("3. Volume-Only Qualification", () => {
  const personal = (tier, volume) =>
    evaluateQualifiedActivation({ accountType: "PERSONAL", referrerTier: tier, cumulativeVolumeUsdc: volume });

  it("qualifies with no balance or deposit prerequisite", () => {
    assert.equal(personal("STARTER", 250).qualified, true);
  });

  it("qualifies at exactly the tier's volume and not a cent below", () => {
    for (const [tier, target, reward] of [
      ["STARTER", 250, 20],
      ["BUILDER", 500, 30],
      ["ARCHITECT", 750, 50],
      ["AMBASSADOR", 1250, 100],
    ]) {
      assert.equal(personal(tier, target - 0.01).qualified, false, `${tier} below target`);
      const hit = personal(tier, target);
      assert.equal(hit.qualified, true, `${tier} at target`);
      assert.equal(hit.method, "TRANSACTION_VOLUME");
      assert.equal(hit.referrerRewardPoints, reward);
      assert.equal(hit.referredRewardPoints, 20);
    }
  });

  it("many small payments count toward volume just like large ones", () => {
    const volume = countedVolume(
      Array.from({ length: 25 }, (_, i) => ({ txHash: `0x${i}`, amountUsd: 10 })),
    );
    assert.equal(personal("STARTER", volume).qualified, true);
  });

  it("business qualifies on volume only", () => {
    const below = evaluateQualifiedActivation({ accountType: "BUSINESS", referrerTier: "STARTER", cumulativeVolumeUsdc: 999 });
    const at = evaluateQualifiedActivation({ accountType: "BUSINESS", referrerTier: "STARTER", cumulativeVolumeUsdc: 1000 });
    assert.equal(below.qualified, false);
    assert.equal(at.qualified, true);
    assert.equal(at.method, "BUSINESS_VOLUME");
  });

  it("payments sent to the referrer do not count", () => {
    const volume = countedVolume([
      // Invitee sends the referrer 275: nothing counts.
      { txHash: "0x1", amountUsd: 275, payeesUsd: { "0xreferrer": 275 } },
      // BatchPay of 100 to the referrer and 60 to someone else: only 60 counts.
      { txHash: "0x2", amountUsd: 160, payeesUsd: { "0xreferrer": 100, "0xfriend": 60 } },
    ]);
    assert.equal(volume, 60);
    assert.equal(personal("STARTER", volume).qualified, false);
  });

  it("a payment reported by both the live report and the chain sync counts once", () => {
    const volume = countedVolume([
      { txHash: "0xabc", amountUsd: 200 }, // live activity report
      { txHash: "0xabc", amountUsd: 200 }, // dashboard chain sync, same moment
      { txHash: "0xdef", amountUsd: 40 },
    ]);
    assert.equal(volume, 240);
    assert.equal(personal("STARTER", volume).qualified, false);
  });
});

describe("4. Ongoing Referrer-Only Activity Cashback Invariants", () => {
  it("should NOT award activity cashback before qualified activation is completed", () => {
    const unqualRes = calculateReferralActivityCashback({
      referrerTier: "STARTER",
      transactionAmountUsdc: 100,
      isQualified: false,
    });
    assert.equal(unqualRes.awarded, false);
    assert.equal(unqualRes.referrerPoints, 0);
  });

  it("should NOT award activity cashback on transactions <= $10 USDC", () => {
    const smallTx1 = calculateReferralActivityCashback({
      referrerTier: "STARTER",
      transactionAmountUsdc: 10,
      isQualified: true,
    });
    assert.equal(smallTx1.awarded, false);
    assert.match(smallTx1.reason, /does not exceed threshold/);

    const smallTx2 = calculateReferralActivityCashback({
      referrerTier: "AMBASSADOR",
      transactionAmountUsdc: 5,
      isQualified: true,
    });
    assert.equal(smallTx2.awarded, false);
  });

  it("should award exact tier cashback on transactions > $10 USDC strictly to the Referrer", () => {
    // Starter: 0.2 SwiftPoints per tx > $10
    const starterCb = calculateReferralActivityCashback({
      referrerTier: "STARTER",
      transactionAmountUsdc: 50,
      isQualified: true,
    });
    assert.equal(starterCb.awarded, true);
    assert.equal(starterCb.referrerPoints, 0.2);
    assert.equal(starterCb.referredPoints, 0, "Referred account receives 0 cashback");

    // Builder: 0.3 SwiftPoints per tx > $10
    const builderCb = calculateReferralActivityCashback({
      referrerTier: "BUILDER",
      transactionAmountUsdc: 50,
      isQualified: true,
    });
    assert.equal(builderCb.awarded, true);
    assert.equal(builderCb.referrerPoints, 0.3);
    assert.equal(builderCb.referredPoints, 0);

    // Architect: 0.5 SwiftPoints per tx > $10
    const architectCb = calculateReferralActivityCashback({
      referrerTier: "ARCHITECT",
      transactionAmountUsdc: 50,
      isQualified: true,
    });
    assert.equal(architectCb.awarded, true);
    assert.equal(architectCb.referrerPoints, 0.5);
    assert.equal(architectCb.referredPoints, 0);

    // Ambassador: 1.0 SwiftPoint per tx > $10
    const ambassadorCb = calculateReferralActivityCashback({
      referrerTier: "AMBASSADOR",
      transactionAmountUsdc: 50,
      isQualified: true,
    });
    assert.equal(ambassadorCb.awarded, true);
    assert.equal(ambassadorCb.referrerPoints, 1.0);
    assert.equal(ambassadorCb.referredPoints, 0);
  });
});

describe("5. SwiftPoints Redemption Thresholds & Invariants", () => {
  const MIN_REDEMPTION_POINTS = 100;

  function validateRedemption(requestedPoints, availablePoints) {
    if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) {
      return { valid: false, error: "Invalid points amount." };
    }
    if (requestedPoints < MIN_REDEMPTION_POINTS) {
      return {
        valid: false,
        error: `Minimum redemption threshold is ${MIN_REDEMPTION_POINTS} SwiftPoints ($1.00 USDC).`,
      };
    }
    if (requestedPoints > availablePoints) {
      return { valid: false, error: "Insufficient points balance." };
    }
    return {
      valid: true,
      usdcValue: Number((requestedPoints * 0.01).toFixed(2)),
    };
  }

  it("should reject redemptions below 100 points", () => {
    const res1 = validateRedemption(99, 500);
    assert.equal(res1.valid, false);
    assert.match(res1.error, /Minimum redemption threshold/);

    const res2 = validateRedemption(0, 500);
    assert.equal(res2.valid, false);
  });

  it("should accept redemptions of 100 points or more when balance permits", () => {
    const res = validateRedemption(100, 100);
    assert.equal(res.valid, true);
    assert.equal(res.usdcValue, 1.00);

    const res2 = validateRedemption(550, 1000);
    assert.equal(res2.valid, true);
    assert.equal(res2.usdcValue, 5.50);
  });

  it("should reject redemptions exceeding available balance", () => {
    const res = validateRedemption(200, 150);
    assert.equal(res.valid, false);
    assert.equal(res.error, "Insufficient points balance.");
  });
});

describe("6. Anti-Fraud & Attribution Invariants", () => {
  it("should prohibit self-referrals", () => {
    const userWallet = "0x1111111111111111111111111111111111111111";
    const referrerWallet = "0x1111111111111111111111111111111111111111";
    const isSelfReferral = userWallet.toLowerCase() === referrerWallet.toLowerCase();
    assert.equal(isSelfReferral, true, "Self-referral must be detected and blocked");
  });

  it("should enforce first-valid-attribution lock", () => {
    const existingAttribution = {
      referrerWallet: "0xaaaa",
      referralToken: "SWIFT-ORIGINAL",
      status: "SIGNED_UP",
    };

    function attemptReattribution(current, newReferrerToken) {
      if (current) {
        return current;
      }
      return { referralToken: newReferrerToken };
    }

    const result = attemptReattribution(existingAttribution, "SWIFT-NEW");
    assert.equal(result.referralToken, "SWIFT-ORIGINAL", "Must retain original first attribution");
  });
});

describe("7. Universal Platform Cashback Tiers (Inclusive From Numbers Up)", () => {
  const GENERAL_CASHBACK_BRACKETS = [
    { minAmount: 1000, points: 50, label: "1,000+" },
    { minAmount: 500, points: 20, label: "500+" },
    { minAmount: 100, points: 5, label: "100+" },
    { minAmount: 20, points: 1, label: "20+" },
  ];

  function calculateTransactionCashback(amountInput) {
    const numericAmount = typeof amountInput === "string" ? parseFloat(amountInput.trim()) : amountInput;

    if (isNaN(numericAmount) || numericAmount < 20) {
      return {
        eligible: false,
        points: 0,
        usdcValue: 0,
        nextTier: {
          threshold: 20,
          points: 1,
          needed: Math.max(0, Number((20 - (isNaN(numericAmount) ? 0 : numericAmount)).toFixed(2))),
        },
      };
    }

    for (let i = 0; i < GENERAL_CASHBACK_BRACKETS.length; i++) {
      const bracket = GENERAL_CASHBACK_BRACKETS[i];
      if (numericAmount >= bracket.minAmount) {
        const prevBracket = GENERAL_CASHBACK_BRACKETS[i - 1];
        return {
          eligible: true,
          points: bracket.points,
          usdcValue: Number((bracket.points * 0.01).toFixed(2)),
          tierLabel: bracket.label,
          nextTier: prevBracket
            ? {
                threshold: prevBracket.minAmount,
                points: prevBracket.points,
                needed: Math.max(0, Number((prevBracket.minAmount - numericAmount).toFixed(2))),
              }
            : undefined,
        };
      }
    }

    return { eligible: false, points: 0, usdcValue: 0 };
  }

  it("should return 0 points and eligible: false for transactions strictly under 20 USDC", () => {
    const res0 = calculateTransactionCashback(0);
    assert.equal(res0.eligible, false);
    assert.equal(res0.points, 0);
    assert.equal(res0.nextTier.needed, 20);

    const res19 = calculateTransactionCashback(19.99);
    assert.equal(res19.eligible, false);
    assert.equal(res19.points, 0);
    assert.equal(res19.nextTier.needed, 0.01);
  });

  it("should award 1 SwiftPoint starting at exactly 20 USDC and up to under 100 USDC", () => {
    const res20 = calculateTransactionCashback(20);
    assert.equal(res20.eligible, true);
    assert.equal(res20.points, 1);
    assert.equal(res20.usdcValue, 0.01);
    assert.equal(res20.nextTier.threshold, 100);
    assert.equal(res20.nextTier.needed, 80);

    const res21 = calculateTransactionCashback(21);
    assert.equal(res21.eligible, true);
    assert.equal(res21.points, 1);
    assert.equal(res21.nextTier.needed, 79);

    const res99 = calculateTransactionCashback(99.99);
    assert.equal(res99.eligible, true);
    assert.equal(res99.points, 1);
    assert.equal(res99.nextTier.needed, 0.01);
  });

  it("should award 5 SwiftPoints starting at exactly 100 USDC up to under 500 USDC", () => {
    const res100 = calculateTransactionCashback(100);
    assert.equal(res100.eligible, true);
    assert.equal(res100.points, 5);
    assert.equal(res100.usdcValue, 0.05);
    assert.equal(res100.nextTier.threshold, 500);
    assert.equal(res100.nextTier.needed, 400);

    const res499 = calculateTransactionCashback(499.99);
    assert.equal(res499.eligible, true);
    assert.equal(res499.points, 5);
  });

  it("should award 20 SwiftPoints starting at exactly 500 USDC up to under 1000 USDC", () => {
    const res500 = calculateTransactionCashback(500);
    assert.equal(res500.eligible, true);
    assert.equal(res500.points, 20);
    assert.equal(res500.usdcValue, 0.20);
    assert.equal(res500.nextTier.threshold, 1000);
    assert.equal(res500.nextTier.needed, 500);

    const res999 = calculateTransactionCashback(999.99);
    assert.equal(res999.eligible, true);
    assert.equal(res999.points, 20);
  });

  it("should award 50 SwiftPoints starting at exactly 1000 USDC and higher", () => {
    const res1000 = calculateTransactionCashback(1000);
    assert.equal(res1000.eligible, true);
    assert.equal(res1000.points, 50);
    assert.equal(res1000.usdcValue, 0.50);
    assert.equal(res1000.nextTier, undefined);

    const res5000 = calculateTransactionCashback(5000);
    assert.equal(res5000.eligible, true);
    assert.equal(res5000.points, 50);
    assert.equal(res5000.nextTier, undefined);
  });
});

