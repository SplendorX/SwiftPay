"use client";

import { useEffect, useRef } from "react";

/**
 * StablecoinBackground
 *
 * Multi-layer ambient background for the marketing hero.
 *
 * Layer order (back to front):
 *   1. Noise grain texture (CSS background, very subtle)
 *   2. Large blurred coin marks — USDC + EURC at 5–8% opacity (mid-layer depth)
 *   3. Mesh radial glows in primary / chart-2 brand colors
 *   4. Smaller drifting coin marks — CSS keyframe drift (GPU-only transform)
 *   5. Scroll-linked opacity + scale-down via IntersectionObserver (no JS animation loop)
 *
 * Token assets: /tokens/usdc.svg and /tokens/eurc.svg — official Circle brand marks
 * already used throughout the platform (see TokenIcon component).
 *
 * NOTE FOR PRODUCTION: Replace /tokens/usdc.svg and /tokens/eurc.svg with
 * official Circle brand assets sourced directly from Circle's brand guidelines:
 * https://www.circle.com/en/brand — do not use these placeholder paths in a
 * production deployment without confirming licence terms with Circle.
 *
 * prefers-reduced-motion: all CSS animations are suppressed via the media query
 * in globals.css. The static layered composition remains visible.
 */
export function StablecoinBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll-linked fade + subtle scale-down.
   * Uses IntersectionObserver — no rAF loop, no layout queries.
   * As the hero scrolls off-screen the background fades to 0 and shrinks
   * slightly (scale 0.97), giving a calm "recede" feel instead of a hard cut.
   */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const hero = el.closest(".marketing-hero-with-showcase");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const ratio = entry.intersectionRatio;
        /* Fade 1 → 0 and scale 1 → 0.97 as the hero scrolls off screen */
        el.style.opacity = String(Math.min(1, ratio * 2));
        el.style.transform = `scale(${1 - (1 - Math.min(1, ratio * 2)) * 0.03})`;
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i * 0.05) },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden
      className="sp-bg-root"
      ref={rootRef}
    >
      {/* ── Layer 1: noise grain ── */}
      <div className="sp-bg-grain" />

      {/* ── Layer 2: large blurred mid-layer coin marks ── */}
      <div className="sp-bg-mid">
        {/*
          USDC — large, top-left quadrant.
          Placeholder: replace src with official Circle USDC circular mark
          before production (https://www.circle.com/en/brand).
        */}
        <img
          alt=""
          className="sp-bg-coin sp-bg-coin-usdc-large"
          draggable={false}
          src="/tokens/usdc.svg"
        />
        {/*
          EURC — large, bottom-right quadrant.
          Placeholder: replace src with official Circle EURC circular mark
          before production (https://www.circle.com/en/brand).
        */}
        <img
          alt=""
          className="sp-bg-coin sp-bg-coin-eurc-large"
          draggable={false}
          src="/tokens/eurc.svg"
        />
      </div>

      {/* ── Layer 3: mesh radial glows ── */}
      <div className="sp-bg-glow sp-bg-glow-a" />
      <div className="sp-bg-glow sp-bg-glow-b" />

      {/* ── Layer 4: smaller drifting coin marks (CSS keyframe only, GPU-safe) ── */}
      <div className="sp-bg-foreground">
        {/* USDC medium — upper right, drift-a (72s) */}
        <img
          alt=""
          className="sp-bg-coin sp-bg-coin-usdc-sm sp-bg-drift-a"
          draggable={false}
          src="/tokens/usdc.svg"
        />
        {/* EURC medium — lower left, drift-b (88s) */}
        <img
          alt=""
          className="sp-bg-coin sp-bg-coin-eurc-sm sp-bg-drift-b"
          draggable={false}
          src="/tokens/eurc.svg"
        />
        {/* USDC small — center left, drift-c (64s) */}
        <img
          alt=""
          className="sp-bg-coin sp-bg-coin-usdc-xs sp-bg-drift-c"
          draggable={false}
          src="/tokens/usdc.svg"
        />
      </div>
    </div>
  );
}
