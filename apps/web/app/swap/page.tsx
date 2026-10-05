"use client";

import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { SwapPanel } from "@/components/swap/SwapPanel";

export default function SwapPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The panel draws its own bar with a back button.
        hideHeader
        subtitle="Stablecoin exchange on Arc"
        title="Swap"
      >
        <SwapPanel />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
