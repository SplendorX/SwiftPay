import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { SettingsHub } from "@/components/settings/settings-hub";

/** The page frame carries the heading ("Settings · Account preferences"). */
export default function SettingsPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The hub draws its own bar with a back button.
        hideHeader
        subtitle="Account preferences"
        title="Settings"
      >
        <SettingsHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
