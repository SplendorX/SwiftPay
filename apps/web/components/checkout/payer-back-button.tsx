"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Back from a payment page: to wherever the payer came from (the Send
 * scanner, a chat), or home when the link was opened fresh from a camera.
 */
export function PayerBackButton() {
  const router = useRouter();
  return (
    <button
      aria-label="Back"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      type="button"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
