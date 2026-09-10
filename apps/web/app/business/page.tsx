"use client";

import { BusinessOverview } from "@/components/account/business-overview";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";

export default function BusinessPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="How your business is doing on SwiftPay"
        title="Overview"
      >
        <BusinessOverview />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
