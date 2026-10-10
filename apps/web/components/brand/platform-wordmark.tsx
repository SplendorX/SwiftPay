import { cn } from "@/lib/utils";

import "./platform-wordmark.css";

type PlatformWordmarkProps = {
  className?: string;
  size?: "header" | "hero";
};

/** The SaphraONE wordmark: black letters on light surfaces, white on dark. */
export function PlatformWordmark({
  className,
  size = "header",
}: PlatformWordmarkProps) {
  return (
    <span
      aria-label="SaphraONE"
      className={cn(
        "platform-wordmark",
        size === "header" && "platform-wordmark-header",
        size === "hero" && "platform-wordmark-hero",
        className,
      )}
      role="img"
    >
      <img
        alt=""
        className="platform-wordmark-img platform-wordmark-on-light"
        decoding="async"
        height={350}
        src="/brand/saphra-wordmark-light.svg"
        width={792}
      />
      <img
        alt=""
        className="platform-wordmark-img platform-wordmark-on-dark"
        decoding="async"
        height={350}
        src="/brand/saphra-wordmark-dark.svg"
        width={792}
      />
    </span>
  );
}
