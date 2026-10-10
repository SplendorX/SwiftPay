import { notFound } from "next/navigation";

import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { RewardsPage } from "@/components/rewards/rewards-page";
import { rewardsV2Enabled } from "@/lib/rewards/config";

export const metadata = {
  title: "Rewards — SaphraONE",
};

export default function Rewards() {
  // Behind NEXT_PUBLIC_REWARDS_V2 until it's rolled out (REWARDS-PLAN.md).
  if (!rewardsV2Enabled()) notFound();
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The page draws its own title, in line with its cards.
        hideHeader
        subtitle="Points from every payment"
        title="Rewards"
      >
        <RewardsPage />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
