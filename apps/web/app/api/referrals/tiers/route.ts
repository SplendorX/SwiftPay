import { jsonOk } from "@/lib/http";
import { TIERS } from "@/lib/referral/tier-service";
import { getReferralRewardPolicy } from "@/lib/referral/policy-service";
import type { ReferralTier } from "@/lib/referral/types";

export const runtime = "nodejs";

export async function GET() {
  const tierKeys: ReferralTier[] = ["STARTER", "BUILDER", "ARCHITECT", "AMBASSADOR"];

  const tiers = tierKeys.map((key) => {
    const def = TIERS[key];
    const personalPolicy = getReferralRewardPolicy(key, "PERSONAL");
    const businessPolicy = getReferralRewardPolicy(key, "BUSINESS");

    return {
      tier: key,
      minPosition: def.minPosition,
      maxPosition: def.maxPosition,
      badgeName: def.badgeName,
      badgeSlug: def.badgeSlug,
      hasExclusiveCampaigns: def.hasExclusiveCampaigns,
      personalEconomics: {
        activationDepositUsdc: personalPolicy.activationBalanceThreshold,
        qualificationOptions: {
          transactionCount: personalPolicy.transactionCountRequirement,
          transactionMinAmountUsdc: personalPolicy.transactionMinAmount,
          volumeThresholdUsdc: personalPolicy.transactionVolumeRequirement,
        },
        directRewardPoints: personalPolicy.referrerDirectRewardPoints,
        referredRewardPoints: personalPolicy.referredAccountRewardPoints,
        cashbackPerTransactionPoints: personalPolicy.activityCashbackPoints,
        cashbackMinTxUsdc: personalPolicy.activityTransactionMinAmount,
      },
      businessEconomics: {
        activationDepositUsdc: businessPolicy.activationBalanceThreshold,
        qualificationOptions: {
          volumeThresholdUsdc: businessPolicy.transactionVolumeRequirement,
        },
        directRewardPoints: businessPolicy.referrerDirectRewardPoints,
        referredRewardPoints: businessPolicy.referredAccountRewardPoints,
        cashbackPerTransactionPoints: businessPolicy.activityCashbackPoints,
        cashbackMinTxUsdc: businessPolicy.activityTransactionMinAmount,
      },
    };
  });

  return jsonOk({ tiers });
}
