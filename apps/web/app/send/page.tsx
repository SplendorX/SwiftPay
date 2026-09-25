"use client";

import { DashboardContent } from "@/app/dashboard/page";
import { PlatformAccessGate } from "@/components/platform-access-gate";

export default function SendPage() {
  return (
    <PlatformAccessGate>
      <DashboardContent view="send" />
    </PlatformAccessGate>
  );
}
