"use client";

import { InvoicesHub } from "@/components/account/invoices-hub";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

export default function InvoicesPage() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Create, send and track professional payment requests"
        title="Invoices"
      >
        <InvoicesHub />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
