import { ActivityPage } from "@/components/activity/activity-page";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";

export const metadata = {
  title: "Activity — SwiftPay",
};

export default function Activity() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The page draws its own header; skip the frame's to avoid a second title.
        hideHeader
        subtitle="Account history"
        title="Activity"
      >
        <ActivityPage />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
