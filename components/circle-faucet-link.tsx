"use client";

import { Droplets } from "lucide-react";

export const circleFaucetUrl = "https://faucet.circle.com/";

export function CircleFaucetLink() {
  return (
    <a
      aria-label="Circle faucet"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-lavender-200 bg-white/80 text-sm font-bold text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white hover:text-swift-700 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-swift-600 focus:ring-offset-2 sm:w-auto sm:px-3"
      href={circleFaucetUrl}
      rel="noreferrer"
      target="_blank"
      title="Circle faucet"
    >
      <Droplets className="h-4 w-4" />
      <span className="hidden sm:inline">Faucet</span>
    </a>
  );
}
