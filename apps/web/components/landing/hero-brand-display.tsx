"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { PlatformWordmark } from "@/components/brand/platform-wordmark";
import { TokenIcon } from "@/components/token-icon";
import type { ArcTokenSymbol } from "@/lib/tokens";

const stablecoins: Array<{
  amount: string;
  label: string;
  symbol: ArcTokenSymbol;
}> = [
  { amount: "24,580.42", label: "USD Coin", symbol: "USDC" },
  { amount: "8,240.00", label: "Euro Coin", symbol: "EURC" },
];

function TransferPulse() {
  return (
    <motion.div
      animate={{ opacity: [0.15, 0.7, 0.15], scaleX: [0.6, 1, 0.6] }}
      className="hero-stablecoin-beam"
      transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
    />
  );
}

function StablecoinOrb({
  delay,
  index,
  token,
}: {
  delay: number;
  index: number;
  token: (typeof stablecoins)[number];
}) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: [0, index === 0 ? -6 : 6, 0] }}
      className="hero-stablecoin-orb"
      initial={{ opacity: 0, scale: 0.92 }}
      transition={{
        opacity: { delay, duration: 0.45 },
        scale: { delay, duration: 0.45 },
        y: { delay: delay + 0.2, duration: 4.5, ease: "easeInOut", repeat: Infinity },
      }}
    >
      <motion.div
        animate={{ rotate: [0, index === 0 ? 4 : -4, 0] }}
        className="hero-stablecoin-icon-wrap"
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
      >
        <TokenIcon className="h-10 w-10 rounded-full shadow-sm" symbol={token.symbol} />
        <motion.span
          animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.9, 0.5] }}
          className="hero-stablecoin-glow"
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
        />
      </motion.div>
      <div className="hero-stablecoin-meta">
        <p className="hero-stablecoin-symbol">{token.symbol}</p>
        <motion.p
          animate={{ opacity: [0.72, 1, 0.72] }}
          className="hero-stablecoin-amount"
          key={token.amount}
          transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
        >
          {token.amount}
        </motion.p>
        <p className="hero-stablecoin-label">{token.label}</p>
      </div>
    </motion.div>
  );
}

export function HeroBrandDisplay() {
  const [activeRail, setActiveRail] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveRail((current) => (current + 1) % stablecoins.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="hero-brand-display"
      initial={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="hero-brand-eyebrow">Arc Testnet infrastructure</p>
      <PlatformWordmark className="hero-brand-name" size="hero" />

      <div className="hero-stablecoin-stage">
        <div className="hero-stablecoin-rail">
          <TransferPulse />
          <motion.div
            animate={{
              left: activeRail === 0 ? "8%" : "72%",
              opacity: [0.4, 1, 0.4],
            }}
            className="hero-stablecoin-packet"
            transition={{
              left: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 1.6, ease: "easeInOut", repeat: Infinity },
            }}
          >
            <TokenIcon
              className="h-4 w-4 rounded-full"
              symbol={stablecoins[activeRail].symbol}
            />
          </motion.div>
        </div>

        <div className="hero-stablecoin-orbs">
          {stablecoins.map((token, index) => (
            <StablecoinOrb
              delay={0.12 + index * 0.1}
              index={index}
              key={token.symbol}
              token={token}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}