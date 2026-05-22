import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { platformAccessCookieName } from "@/lib/platform-access";

const protectedRouteMatchers = [
  "/dashboard",
  "/pay",
  "/privSwiftPay",
  "/roadmap",
  "/settings",
  "/swap",
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

  if (request.cookies.get(platformAccessCookieName)?.value === "1") {
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
    "/pay/:path*",
    "/privSwiftPay/:path*",
    "/roadmap/:path*",
    "/settings/:path*",
    "/swap/:path*",
  ],
};
