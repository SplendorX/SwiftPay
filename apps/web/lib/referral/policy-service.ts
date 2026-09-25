import type {
  ReferralRewardPolicy,
  ReferralTier,
  ReferredAccountType,
} from "@/lib/referral/types";
import { REFERRED_QUALIFICATION_REWARD_POINTS } from "@/lib/referral/types";

export const POLICY_VERSION = "1.0";

const POLICIES: Record<
  ReferralTier,
  Record<ReferredAccountType, ReferralRewardPolicy>
> = {
  STARTER: {
    PERSONAL: {
      tier: "STARTER",
      referredAccountType: "PERSONAL",
      activationBalanceThreshold: 50,
      transactionCountRequirement: 5,
      transactionMinAmount: 50,
      transactionVolumeRequirement: 250,
      referrerDirectRewardPoints: 20,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 0.2,
      activityTransactionMinAmount: 10,
      policyVersion: POLICY_VERSION,
    },
    BUSINESS: {
      tier: "STARTER",
      referredAccountType: "BUSINESS",
      activationBalanceThreshold: 500,
      transactionCountRequirement: 0,
      transactionMinAmount: 0,
      transactionVolumeRequirement: 1000,
      referrerDirectRewardPoints: 50,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 0.5,
      activityTransactionMinAmount: 50,
      policyVersion: POLICY_VERSION,
    },
  },
  BUILDER: {
    PERSONAL: {
      tier: "BUILDER",
      referredAccountType: "PERSONAL",
      activationBalanceThreshold: 50,
      transactionCountRequirement: 10,
      transactionMinAmount: 50,
      transactionVolumeRequirement: 500,
      referrerDirectRewardPoints: 30,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 0.3,
      activityTransactionMinAmount: 10,
      policyVersion: POLICY_VERSION,
    },
    BUSINESS: {
      tier: "BUILDER",
      referredAccountType: "BUSINESS",
      activationBalanceThreshold: 500,
      transactionCountRequirement: 0,
      transactionMinAmount: 0,
      transactionVolumeRequirement: 2000,
      referrerDirectRewardPoints: 100,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 1.0,
      activityTransactionMinAmount: 50,
      policyVersion: POLICY_VERSION,
    },
  },
  ARCHITECT: {
    PERSONAL: {
      tier: "ARCHITECT",
      referredAccountType: "PERSONAL",
      activationBalanceThreshold: 50,
      transactionCountRequirement: 15,
      transactionMinAmount: 50,
      transactionVolumeRequirement: 750,
      referrerDirectRewardPoints: 50,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 0.5,
      activityTransactionMinAmount: 10,
      policyVersion: POLICY_VERSION,
    },
    BUSINESS: {
      tier: "ARCHITECT",
      referredAccountType: "BUSINESS",
      activationBalanceThreshold: 500,
      transactionCountRequirement: 0,
      transactionMinAmount: 0,
      transactionVolumeRequirement: 3000,
      referrerDirectRewardPoints: 150,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 1.5,
      activityTransactionMinAmount: 50,
      policyVersion: POLICY_VERSION,
    },
  },
  AMBASSADOR: {
    PERSONAL: {
      tier: "AMBASSADOR",
      referredAccountType: "PERSONAL",
      activationBalanceThreshold: 50,
      transactionCountRequirement: 25,
      transactionMinAmount: 50,
      transactionVolumeRequirement: 1250,
      referrerDirectRewardPoints: 100,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 1.0,
      activityTransactionMinAmount: 10,
      policyVersion: POLICY_VERSION,
    },
    BUSINESS: {
      tier: "AMBASSADOR",
      referredAccountType: "BUSINESS",
      activationBalanceThreshold: 500,
      transactionCountRequirement: 0,
      transactionMinAmount: 0,
      transactionVolumeRequirement: 5000,
      referrerDirectRewardPoints: 200,
      referredAccountRewardPoints: REFERRED_QUALIFICATION_REWARD_POINTS,
      activityCashbackPoints: 2.0,
      activityTransactionMinAmount: 50,
      policyVersion: POLICY_VERSION,
    },
  },
};

/**
 * Get the exact referral reward policy for a given tier and referred account type.
 */
export function getReferralRewardPolicy(
  tier: ReferralTier,
  referredAccountType: ReferredAccountType,
): ReferralRewardPolicy {
  const policy = POLICIES[tier]?.[referredAccountType];
  if (!policy) {
    throw new Error(`Reward policy not found for tier ${tier} and type ${referredAccountType}`);
  }
  return policy;
}
