"use client";

import { ArrowRight } from "lucide-react";

import { FadeUp } from "@/components/design/motion";
import { LaunchAppLink } from "@/components/landing/launch-app-link";
import { Button } from "@/components/ui/button";

export function HeroWelcome() {
  return (
    <FadeUp className="hero-welcome">
      <div className="hero-welcome-scrim" aria-hidden />

      <p className="hero-welcome-kicker">SwiftPay on Arc</p>
      <h1 className="hero-welcome-title">
        <span className="hero-welcome-line">
          Do more with <span className="hero-welcome-accent">USDC</span>
        </span>
      </h1>
      <p className="hero-welcome-lead">
        Welcome to SwiftPay, an all-round payment platform. Swap, send,
        request, batch, save, and schedule stablecoin payments from one wallet.
        Gas is paid in USDC, so what you see is what you spend.
      </p>
      <div className="hero-welcome-actions">
        <LaunchAppLink className="hero-launch-btn">
          Open SwiftPay
          <ArrowRight className="h-4 w-4" />
        </LaunchAppLink>
        <Button asChild className="hero-features-btn" size="lg" variant="outline">
          <a href="#products">See features</a>
        </Button>
      </div>
    </FadeUp>
  );
}
