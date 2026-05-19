import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/app/providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

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
    <html data-scroll-behavior="smooth" lang="en">
      <body className={`${manrope.variable} ${sora.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
