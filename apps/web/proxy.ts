import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { platformAccessCookieName } from "@/lib/platform-access";
import { walletSessionCookieName } from "@/lib/wallet-session";

const protectedRouteMatchers = [
  "/dashboard",
  "/business",
  "/pay",
  "/settings",
  "/swap",
  "/swiftBatch",
  "/batchpay",
  "/batchPay",
  "/swiftRecurepay",
];

function isProtectedRoute(pathname: string) {
  return protectedRouteMatchers.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  if (
    request.cookies.get(platformAccessCookieName)?.value === "1" ||
    Boolean(request.cookies.get(walletSessionCookieName)?.value)
  ) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("next", pathname);

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/business/:path*",
    "/pay/:path*",
    "/settings/:path*",
    "/swap/:path*",
    "/swiftBatch/:path*",
    "/batchpay/:path*",
    "/batchPay/:path*",
    "/swiftRecurepay/:path*",
  ],
};
