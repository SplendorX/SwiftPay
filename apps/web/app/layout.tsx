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

const siteTitle = "SwiftPay | Financial infrastructure on Arc";
const siteDescription =
  "Money movement infrastructure for the internet. Send, batch, request, swap, and settle stablecoins on Arc Testnet.";
const brandMark = "/brand/swiftpay-mark.png";

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) {
    return `https://${vercelHost}`;
  }

  return "http://localhost:3000";
}

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: siteTitle,
  description: siteDescription,
  icons: {
    apple: [{ url: brandMark, type: "image/png", sizes: "180x180" }],
    icon: [{ url: brandMark, type: "image/png", sizes: "32x32" }],
    shortcut: brandMark,
  },
  openGraph: {
    description: siteDescription,
    images: [
      {
        alt: "SwiftPay",
        height: 1024,
        url: brandMark,
        width: 1024,
      },
    ],
    title: siteTitle,
    type: "website",
  },
  twitter: {
    card: "summary",
    description: siteDescription,
    images: [brandMark],
    title: siteTitle,
  },
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