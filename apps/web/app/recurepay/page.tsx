import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { SwiftRecurepayHub } from "@/components/swift-recurepay/swift-recurepay-hub";

export default function SwiftRecurepayPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The page draws its own header; skip the frame's to avoid a second title.
        hideHeader
        subtitle="Scheduled payments"
        title="RecurePay"
      >
        <SwiftRecurepayHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}