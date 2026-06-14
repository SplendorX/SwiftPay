"use client";

import type { ReactNode } from "react";

import { PlatformChrome } from "@/components/layout/platform-chrome";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";

export function PayPageShell({ children }: { children: ReactNode }) {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        subtitle="Payment collection hub"
        title="Request"
      >
        {children}
      </PlatformChrome>
    </PlatformAccessGate>
  );
}