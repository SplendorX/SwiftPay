import { PlatformLogoMark } from "@/components/brand/platform-logo-mark";
import { PlatformWordmark } from "@/components/brand/platform-wordmark";
import { cn } from "@/lib/utils";

type PlatformBrandProps = {
  className?: string;
  showName?: "always" | "desktop";
  size?: "header" | "hero";
};

export function PlatformBrand({
  className,
  showName = "always",
  size = "header",
}: PlatformBrandProps) {
  return (
    <span className={cn("platform-brand", className)}>
      <PlatformLogoMark />
      <PlatformWordmark
        className={cn(showName === "desktop" && "platform-brand-name-desktop")}
        size={size}
      />
    </span>
  );
}
