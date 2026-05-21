import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

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
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${sora.variable}`}>
        <Script id="swiftpay-theme" strategy="beforeInteractive">
          {`try{var theme=localStorage.getItem("swiftpay.theme");if(theme==="dark"){document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark";}}catch(error){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
