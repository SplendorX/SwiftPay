"use client";

import { motion } from "framer-motion";

import { StablecoinBackground } from "@/components/landing/stablecoin-background";

export function AmbientBackground({ variant = "default" }: { variant?: "default" | "hero" | "dashboard" }) {
  if (variant === "dashboard") {
    return null;
  }

  if (variant === "hero") {
    return <StablecoinBackground />;
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="ambient-grid absolute inset-x-0 top-0 h-[min(50vh,480px)]" />
      <motion.div
        animate={{ x: [0, 20, 0], y: [0, -12, 0] }}
        className="ambient-orb ambient-orb-a"
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        animate={{ x: [0, -16, 0], y: [0, 10, 0] }}
        className="ambient-orb ambient-orb-b"
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}