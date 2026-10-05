import { InsightsPage } from "@/components/insights/insights-page";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";

export const metadata = {
  title: "Insights — SwiftPay",
};

export default function Insights() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The page draws its own header; skip the frame's to avoid a second title.
        hideHeader
        subtitle="Money in, money out"
        title="Insights"
      >
        <InsightsPage />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
