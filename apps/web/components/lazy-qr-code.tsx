"use client";

import dynamic from "next/dynamic";

export const LazyQRCodeSVG = dynamic(
  () => import("qrcode.react").then((module) => module.QRCodeSVG),
  {
    loading: () => (
      <div className="h-[220px] w-[220px] rounded-md border border-lavender-100 bg-lavender-50" />
    ),
    ssr: false,
  },
);
