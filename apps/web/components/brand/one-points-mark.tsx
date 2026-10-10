import { cn } from "@/lib/utils";

/**
 * The ONE Points mark: the app's ONE logo on a rounded, softly shaded
 * hexagon (public/brand/one-points-hex.svg). Sized by its className
 * (h-4 w-4, or em in CSS) like a lucide icon.
 */
export function OnePointsMark({ className }: { className?: string }) {
  return (
    <img
      alt=""
      aria-hidden
      className={cn("shrink-0", className)}
      decoding="async"
      height={32}
      src="/brand/one-points-hex.svg"
      width={32}
    />
  );
}
