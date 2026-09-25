"use client";

import { ArrowUpRight, Gift, PiggyBank, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { REFERRED_QUALIFICATION_REWARD_POINTS } from "@/lib/referral/types";

type EarnMode = "live" | "simulation" | "unavailable";
type EarnApy = { display: string | null; estimate: boolean; mode: EarnMode | null };

/**
 * Earn's net APY for the promo. Only live mode has one: simulation (testnet
 * mock pool) has no interest rate at all, so the card says so rather than
 * showing a number.
 */
function useEarnApy() {
  const [apy, setApy] = useState<EarnApy>({ display: null, estimate: false, mode: null });

  useEffect(() => {
    let active = true;
    fetch("/api/earn/apy")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (payload: {
          current?: { isEstimate?: boolean; isSimulation?: boolean; netApyDisplay?: string | null };
          mode?: EarnMode;
        } | null) => {
          if (!active || !payload) return;
          const display = payload.current?.netApyDisplay ?? null;
          setApy({
            display: display && display !== "0%" && display !== "0.00%" ? display : null,
            estimate: Boolean(payload.current?.isEstimate),
            mode: payload.mode ?? null,
          });
        },
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return apy;
}

type Promo = {
  body: string;
  /** Optional second line, set apart from the pitch. */
  extra?: string;
  figure: string;
  figureNote: string;
  href: string;
  icon: LucideIcon;
  id: "earn" | "save" | "invite";
  title: string;
};

/** Slim boards that point people at Earn, Save and Invite & Earn. */
export function FeaturePromos() {
  const apy = useEarnApy();

  const promos: Promo[] = [
    {
      body: "Put idle USDC to work and move it back whenever you need it.",
      ...(apy.display
        ? { figure: apy.display, figureNote: apy.estimate ? "est. net APY" : "net APY" }
        : apy.mode === "simulation"
          ? { figure: "Demo", figureNote: "testnet, no real yield" }
          : { figure: "USDC", figureNote: "yield when live" }),
      href: "/earn",
      icon: TrendingUp,
      id: "earn",
      title: "Earn",
    },
    {
      body: "Set money aside in pockets, or save a little each time you spend.",
      figure: "Pockets",
      figureNote: "+ Spend&Save",
      href: "/save",
      icon: PiggyBank,
      id: "save",
      title: "Save",
    },
    {
      body: "Invite a friend. You both get SwiftPoints once they get started.",
      // Referral activity cashback: points per qualifying payment the friend
      // makes, rising with the referrer's tier (see lib/referral/policy-service).
      extra: "Then earn cashback on every payment they make.",
      figure: `+${REFERRED_QUALIFICATION_REWARD_POINTS}`,
      figureNote: "SwiftPoints each",
      href: "/referral",
      icon: Gift,
      id: "invite",
      title: "Invite & Earn",
    },
  ];

  return (
    <div aria-label="Explore SwiftPay" className="feature-promos" role="list">
      {promos.map(({ body, extra, figure, figureNote, href, icon: Icon, id, title }) => (
        <Link
          className="feature-promo board-edge"
          data-promo={id}
          href={href}
          key={id}
          role="listitem"
        >
          <span aria-hidden className="feature-promo-icon">
            <Icon className="h-[1.1rem] w-[1.1rem]" />
          </span>
          <span className="feature-promo-copy">
            <span className="feature-promo-title">
              {title}
              <ArrowUpRight className="feature-promo-arrow h-3.5 w-3.5" />
            </span>
            <span className="feature-promo-body">{body}</span>
            {extra ? <span className="feature-promo-extra">{extra}</span> : null}
          </span>
          <span className="feature-promo-figure">
            <strong>{figure}</strong>
            <small>{figureNote}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}
