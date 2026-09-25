"use client";

import { CrashScreen } from "@/components/errors/crash-screen";
import "./globals.css";

/** Last resort: when even the root layout fails, still explain and report it. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html className="dark" data-theme="dark" lang="en">
      <body className="bg-background text-foreground">
        <CrashScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
