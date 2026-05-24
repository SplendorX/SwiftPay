import type { ReactNode } from "react";

import { PlatformNav } from "@/components/platform-nav";

export function PlatformPageBody({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
      <PlatformNav />
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
