import { cn } from "@/lib/utils";

type PlatformWordmarkProps = {
  className?: string;
  size?: "header" | "hero";
};

export function PlatformWordmark({
  className,
  size = "header",
}: PlatformWordmarkProps) {
  return (
    <span
      aria-label="SwiftPay"
      className={cn(
        "platform-wordmark",
        size === "header" && "platform-wordmark-header",
        size === "hero" && "platform-wordmark-hero",
        className,
      )}
    >
      <span className="platform-wordmark-swift">Swift</span>
      <span className="platform-wordmark-pay">Pay</span>
    </span>
  );
}