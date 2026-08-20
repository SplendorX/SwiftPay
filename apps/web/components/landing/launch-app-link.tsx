"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  circleSessionEventName,
  readCircleLogin,
} from "@/lib/circle-session";
import {
  hasPlatformAccessCookie,
  platformAccessEventName,
} from "@/lib/platform-access";

export function useHasSignedIn() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    function refresh() {
      setSignedIn(Boolean(readCircleLogin() || hasPlatformAccessCookie()));
    }

    refresh();
    window.addEventListener(circleSessionEventName, refresh);
    window.addEventListener(platformAccessEventName, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(circleSessionEventName, refresh);
      window.removeEventListener(platformAccessEventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return signedIn;
}

export function LaunchAppLink({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const signedIn = useHasSignedIn();

  return (
    <Link className={className} href={signedIn ? "/dashboard" : "/#sign-in"}>
      {children ?? "Launch App"}
    </Link>
  );
}
