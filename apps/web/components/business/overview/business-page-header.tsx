"use client";

import { BusinessIdentityBadge } from "./business-identity-badge";

type BusinessPageHeaderProps = {
  businessName?: string | null;
  isVerified?: boolean;
};

export function BusinessPageHeader({
  businessName,
  isVerified = false,
}: BusinessPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Business Overview
        </h1>
        <p className="mt-1 text-sm sm:text-base text-muted-foreground">
          Here&apos;s how your business is performing today.
        </p>
      </div>
      <BusinessIdentityBadge
        businessName={businessName}
        isVerified={isVerified}
      />
    </header>
  );
}
