import type { ReferralTier } from "@/lib/referral/types";

export type TierDefinition = {
  tier: ReferralTier;
  minPosition: number;
  maxPosition: number | null;
  badgeName: string | null;
  badgeSlug: string | null;
  hasExclusiveCampaigns: boolean;
};

export const TIERS: Record<ReferralTier, TierDefinition> = {
  STARTER: {
    tier: "STARTER",
    minPosition: 1,
    maxPosition: 50,
    badgeName: null,
    badgeSlug: null,
    hasExclusiveCampaigns: false,
  },
  BUILDER: {
    tier: "BUILDER",
    minPosition: 51,
    maxPosition: 200,
    badgeName: "Builder",
    badgeSlug: "builder",
    hasExclusiveCampaigns: false,
  },
  ARCHITECT: {
    tier: "ARCHITECT",
    minPosition: 201,
    maxPosition: 500,
    badgeName: "Architect",
    badgeSlug: "architect",
    hasExclusiveCampaigns: true,
  },
  AMBASSADOR: {
    tier: "AMBASSADOR",
    minPosition: 501,
    maxPosition: null,
    badgeName: "Verified Golden Ambassador",
    badgeSlug: "ambassador",
    hasExclusiveCampaigns: true,
  },
};

/**
 * Determine universal tier strictly based on total successful referrals.
 * Position 1..50 = STARTER
 * Position 51..200 = BUILDER
 * Position 201..500 = ARCHITECT
 * Position 501+ = AMBASSADOR
 */
export function getTier(successfulReferralsCount: number): ReferralTier {
  if (successfulReferralsCount >= 501) return "AMBASSADOR";
  if (successfulReferralsCount >= 201) return "ARCHITECT";
  if (successfulReferralsCount >= 51) return "BUILDER";
  return "STARTER";
}

/**
 * Determine the tier for the next incoming qualifying referral.
 * e.g., if current count is 50, referral #51 is awarded at BUILDER tier.
 */
export function getTierForPosition(position: number): ReferralTier {
  if (position >= 501) return "AMBASSADOR";
  if (position >= 201) return "ARCHITECT";
  if (position >= 51) return "BUILDER";
  return "STARTER";
}

/**
 * Calculate progress toward next tier.
 */
export function getTierProgress(totalSuccessfulReferrals: number): {
  currentTier: ReferralTier;
  nextTier: ReferralTier | null;
  currentCount: number;
  targetCount: number;
  progressPercentage: number;
} {
  const currentTier = getTier(totalSuccessfulReferrals);

  switch (currentTier) {
    case "STARTER":
      return {
        currentTier,
        nextTier: "BUILDER",
        currentCount: totalSuccessfulReferrals,
        targetCount: 51,
        progressPercentage: Math.min(100, Math.round((totalSuccessfulReferrals / 50) * 100)),
      };
    case "BUILDER":
      return {
        currentTier,
        nextTier: "ARCHITECT",
        currentCount: totalSuccessfulReferrals,
        targetCount: 201,
        progressPercentage: Math.min(
          100,
          Math.round(((totalSuccessfulReferrals - 50) / 150) * 100),
        ),
      };
    case "ARCHITECT":
      return {
        currentTier,
        nextTier: "AMBASSADOR",
        currentCount: totalSuccessfulReferrals,
        targetCount: 501,
        progressPercentage: Math.min(
          100,
          Math.round(((totalSuccessfulReferrals - 200) / 300) * 100),
        ),
      };
    case "AMBASSADOR":
      return {
        currentTier,
        nextTier: null,
        currentCount: totalSuccessfulReferrals,
        targetCount: totalSuccessfulReferrals,
        progressPercentage: 100,
      };
  }
}
