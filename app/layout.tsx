import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "SwiftPay | Circle-powered wallet payments",
  description:
    "A stablecoin payment platform for EURC and USDC transfers, receiving, swaps, and ArcScan receipts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body>
        <Script id="swiftpay-theme" strategy="beforeInteractive">
          {`try{var theme=localStorage.getItem("swiftpay.theme");if(theme==="dark"){document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark";}}catch(error){}`}
        </Script>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
