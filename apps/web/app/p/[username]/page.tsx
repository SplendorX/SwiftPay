"use client";

import { useParams } from "next/navigation";

import { StorefrontPage } from "@/components/checkout/storefront-page";

export default function StorefrontRoute() {
  const params = useParams<{ username: string }>();
  return <StorefrontPage username={decodeURIComponent(params.username)} />;
}
