"use client";

import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { SwiftSaveHub } from "@/components/save/swift-save-hub";

export default function SwiftSavePage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The balance hero leads the page; skip the frame's title.
        hideHeader
        subtitle="Non-interest savings pockets and Spend&Save"
        title="Save"
      >
        <SwiftSaveHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
