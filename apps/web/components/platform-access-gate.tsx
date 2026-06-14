"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import {
  circleSessionEventName,
  readCircleLogin,
} from "@/lib/circle-session";
import {
  markPlatformProfileConnected,
  platformAccessEventName,
  readActivatedExternalProfile,
} from "@/lib/platform-access";

function hasPlatformAccess(address?: string) {
  if (readCircleLogin()) {
    return true;
  }

  const activatedExternalProfile = readActivatedExternalProfile();

  return Boolean(
    address &&
      activatedExternalProfile &&
      activatedExternalProfile === address.toLowerCase(),
  );
}

export function PlatformAccessGate({ children }: { children: ReactNode }) {
  const { address, isConnected, status } = useAccount();
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    let lockTimeoutId: number | undefined;

    function refreshAccess() {
      if (lockTimeoutId !== undefined) {
        window.clearTimeout(lockTimeoutId);
        lockTimeoutId = undefined;
      }

      if (hasPlatformAccess(isConnected ? address : undefined)) {
        markPlatformProfileConnected();
        setIsLocked(false);
        return;
      }

      if (status === "connecting" || status === "reconnecting") {
        setIsLocked(false);
        return;
      }

      lockTimeoutId = window.setTimeout(() => {
        setIsLocked(true);
      }, 900);
    }

    refreshAccess();

    window.addEventListener(circleSessionEventName, refreshAccess);
    window.addEventListener(platformAccessEventName, refreshAccess);
    window.addEventListener("storage", refreshAccess);

    return () => {
      if (lockTimeoutId !== undefined) {
        window.clearTimeout(lockTimeoutId);
      }

      window.removeEventListener(circleSessionEventName, refreshAccess);
      window.removeEventListener(platformAccessEventName, refreshAccess);
      window.removeEventListener("storage", refreshAccess);
    };
  }, [address, isConnected, status]);

  if (isLocked) {
    return (
      <main className="relative min-h-screen overflow-hidden px-0 py-4 text-ink sm:px-6 lg:px-8">
        <div className="dashboard-ambient pointer-events-none absolute inset-0" />
        <div className="soft-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
        <section className="surface-panel relative mx-auto mt-10 max-w-xl p-5 text-center sm:p-6">
          <p className="eyebrow">Profile required</p>
          <h1 className="mt-3 font-heading text-2xl font-semibold tracking-normal text-ink">
            Connect from Home to continue
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Use Google login or connect an external wallet on the Home page to
            access the SwiftPay platform.
          </p>
          <Link
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-swift-600 px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(66,17,143,0.24)] transition hover:-translate-y-0.5 hover:bg-swift-700"
            href="/"
          >
            Go to Home
          </Link>
        </section>
      </main>
    );
  }

  return children;
}
