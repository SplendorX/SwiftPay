"use client";

import { useEffect, useState } from "react";

/** Long enough to read as a splash rather than a flicker on fast loads. */
const MIN_VISIBLE_MS = 3000;
/** Matches the fade in .saphra-splash. */
const FADE_MS = 500;

/**
 * The SaphraONE logo while the app opens. It is in the server HTML, so it
 * paints before any JavaScript, and fades once the app has hydrated. The root
 * layout never remounts, so it shows on a full load or refresh only, not on
 * navigation. If JavaScript never runs, a CSS timer hides it anyway.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">("visible");

  useEffect(() => {
    const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
    const leave = window.setTimeout(() => setPhase("leaving"), wait);
    const remove = window.setTimeout(() => setPhase("gone"), wait + FADE_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-label="Loading SaphraONE"
      className={`saphra-splash${phase === "leaving" ? " saphra-splash-leaving" : ""}`}
      role="status"
    >
      <img
        alt=""
        className="saphra-splash-mark"
        decoding="sync"
        fetchPriority="high"
        height={192}
        src="/icons/icon-192.png"
        width={192}
      />
      <span aria-hidden className="saphra-splash-bar" />
    </div>
  );
}
