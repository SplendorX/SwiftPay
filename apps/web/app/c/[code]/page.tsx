"use client";

import { useParams } from "next/navigation";

import { PayChargePage } from "@/components/checkout/pay-charge-page";

export default function ChargePage() {
  const params = useParams<{ code: string }>();
  return <PayChargePage code={params.code} />;
}
