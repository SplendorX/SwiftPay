import "./globals.css";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope, Sora } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SwiftPay | Financial infrastructure on Arc",
  description:
    "Money movement infrastructure for the internet. Send, batch, request, swap, and settle stablecoins on Arc Testnet.",
};

const themeInitScript = `(function(){try{var theme=localStorage.getItem("swiftpay.theme");if(theme==="dark"){document.documentElement.dataset.theme="dark";document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(error){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <html
      className={cn(manrope.variable, sora.variable)}
      data-scroll-behavior="smooth"
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          id="swiftpay-theme-init"
        />
        <TooltipProvider>
          <Providers cookies={cookies}>{children}</Providers>
          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}