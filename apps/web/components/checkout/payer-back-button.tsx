"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readPreviousInAppPath } from "@/components/in-app-navigation";

/**
 * Back from a payment page, shown only when the payer got here from inside
 * SaphraONE (the Send scanner, a chat). A link opened fresh from a camera has
 * nowhere to go back to, so it shows nothing.
 */
export function PayerBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [fromApp, setFromApp] = useState(false);

  useEffect(() => {
    setFromApp(Boolean(readPreviousInAppPath(pathname)));
  }, [pathname]);

  if (!fromApp) return null;
  return (
    <button
      aria-label="Back"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
      onClick={() => router.back()}
      type="button"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
