import { cn } from "@/lib/utils";

export function PlatformLogoMark({ className }: { className?: string }) {
  return (
    <img
      alt=""
      className={cn("platform-logo-mark", className)}
      decoding="async"
      height={1024}
      src="/brand/swiftpay-mark.png"
      width={1024}
    />
  );
}
