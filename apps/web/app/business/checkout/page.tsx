"use client";

import { MerchantCheckoutHub } from "@/components/checkout/merchant-checkout-hub";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

export default function CheckoutPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The hub draws its own bar with a back button.
        hideHeader
        subtitle="Take in-person payments with a QR code"
        title="Checkout"
      >
        <MerchantCheckoutHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
