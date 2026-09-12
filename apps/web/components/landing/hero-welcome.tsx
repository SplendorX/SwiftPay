"use client";

import { ArrowRight } from "lucide-react";

import { FadeUp } from "@/components/design/motion";
import { LaunchAppLink } from "@/components/landing/launch-app-link";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";

export function HeroWelcome() {
  const t = useT();

  return (
    <FadeUp className="hero-welcome">
      <div className="hero-welcome-scrim" aria-hidden />

      <p className="hero-welcome-kicker">{t("landing.kicker")}</p>
      <h1 className="hero-welcome-title">
        <span className="hero-welcome-line">
          {t("landing.heroTitleBefore")}{" "}
          <span className="hero-welcome-accent">USDC</span>
        </span>
      </h1>
      <p className="hero-welcome-lead">{t("landing.heroLead")}</p>
      <div className="hero-welcome-actions">
        <LaunchAppLink className="hero-launch-btn">
          {t("common.openSwiftPay")}
          <ArrowRight className="h-4 w-4" />
        </LaunchAppLink>
        <Button asChild className="hero-features-btn" size="lg" variant="outline">
          <a href="#products">{t("common.seeFeatures")}</a>
        </Button>
      </div>
    </FadeUp>
  );
}
