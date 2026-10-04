"use client";

import { useEffect, useState } from "react";

/** Whether `query` matches, kept current. False until mounted (no SSR guess). */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/**
 * Side panels slide in from the right on a desktop-width screen, and up from
 * the bottom on phones and tablets (the same 1024px breakpoint as the nav).
 */
export function useSheetSide(): "bottom" | "right" {
  return useMediaQuery("(min-width: 1024px)") ? "right" : "bottom";
}

/** Classes that make a bottom sheet feel native: rounded top, almost full height. */
export const bottomSheetClassName =
  "h-[92dvh] max-h-[92dvh] rounded-t-[1.75rem] border-t-0";
