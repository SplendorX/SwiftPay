import { PlatformBrand } from "@/components/brand/platform-brand";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

export default function OnboardingPage() {
  return (
    <PlatformAccessGate>
      <div className="min-h-screen bg-background">
        <header className="flex items-center justify-between px-6 py-4">
          <PlatformBrand />
          <PlatformProfileControls />
        </header>
        <OnboardingFlow />
      </div>
    </PlatformAccessGate>
  );
}
