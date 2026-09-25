"use client";

import { Suspense } from "react";

import { EarnPage } from "@/components/earn/EarnPage";

export default function EarnRoute() {
  return (
    <Suspense fallback={null}>
      <EarnPage />
    </Suspense>
  );
}
