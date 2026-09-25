import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { SwiftCircleHub } from "@/components/swift-circle/swift-circle-hub";

export default function SwiftCircleDetailPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="A private hub for group money. Chat, pay, request, and save together."
        title="Circle"
      >
        <SwiftCircleHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
