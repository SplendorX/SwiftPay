"use client";

import { DepositHub } from "@/components/deposit/deposit-hub";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

export default function DepositPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        backHref="/dashboard"
        subtitle="Get paid, or bring funds onto Arc"
        title="Deposit"
      >
        <DepositHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
