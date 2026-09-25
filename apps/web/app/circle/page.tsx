import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { SwiftCircleList } from "@/components/swift-circle/swift-circle-list";

export default function SwiftCirclePage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Your rooms for money and conversation"
        title="Circle"
      >
        <SwiftCircleList />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
