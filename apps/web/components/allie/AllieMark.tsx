"use client";

import { cn } from "@/lib/utils";

/**
 * ALLIE's mark: her round portrait (public/brand/allie-avatar-256.webp).
 *
 * Drawn as a CSS background rather than an <img> so the call sites that size
 * it in CSS (the landing lockup scales with type) keep working. It's
 * decorative next to the "ALLIE" name, so screen readers skip it.
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
