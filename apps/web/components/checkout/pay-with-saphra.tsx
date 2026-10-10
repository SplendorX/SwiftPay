"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { registerChargeIntentClient, saphraSendHref } from "@/lib/checkout/client";
import type { PublicChargePayload } from "@/lib/checkout/types";

/**
 * Pay from a SaphraONE account through /send, prefilled and tagged with the
 * charge. Signed-out visitors sign in first and land back on the same link.
 */
export function PayWithSaphra({ payload, total }: { payload: PublicChargePayload; total: string }) {
  const href = saphraSendHref({
    code: payload.charge.code,
    currency: payload.charge.currency,
    destinationWallet: payload.destinationWallet,
    total,
  });

  return (
    <div className="space-y-2">
      <Button asChild className="h-12 w-full text-base">
        <a
          href={href}
          onClick={() => {
            void registerChargeIntentClient(payload.charge.code, { method: "SWIFTPAY" }).catch(
              () => undefined,
            );
          }}
        >
          Pay with my SaphraONE account
          <ArrowRight className="h-4 w-4" />
        </a>
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Opens Send with {payload.business.name} and the amount filled in. You&rsquo;ll be asked to
        sign in first if you aren&rsquo;t already.
      </p>
    </div>
  );
}
