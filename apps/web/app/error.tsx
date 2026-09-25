"use client";

import { CrashScreen } from "@/components/errors/crash-screen";

/** Any page that throws while rendering lands here instead of a blank screen. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen error={error} reset={reset} />;
}
