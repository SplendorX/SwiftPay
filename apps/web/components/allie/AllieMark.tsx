"use client";

import { cn } from "@/lib/utils";

/**
 * ALLIE's mark — the supplied artwork with its ground keyed out.
 *
 * Painted as a CSS mask rather than an <img>: the geometry stays exactly as
 * drawn, but the ink follows `currentColor`. The artwork's own dark teal all
 * but vanishes against the purple launcher pill and in dark mode, and a mask
 * lets each surface pick a legible colour without touching the shape. The
 * negative space between the arm and the stroke is genuinely transparent, so
 * the mark sits on any background without a tile behind it.
 *
 * It never animates: a logo that spins reads as a loading state, and this one
 * sits on screens where nothing is loading.
 */
export function AllieMark({
  className,
  size,
}: {
  className?: string;
  /**
   * Fixed pixel size. Omit it to let CSS size the mark instead — needed
   * wherever the mark has to scale with fluid type, since an inline style
   * would win over any stylesheet rule.
   */
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn("allie-mark", className)}
      style={size ? { height: size, width: size } : undefined}
    />
  );
}
