"use client";

import { Download, MonitorDown, PlusSquare, Share, Smartphone, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── The browser's install prompt, captured as early as possible ─────────────

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  // Chrome and Edge fire this once, early; keep it for when the user asks.
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Platform = "ios" | "android" | "mac-safari" | "desktop" | "unsupported";

function detectPlatform(): Platform {
  const agent = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos) return "ios";
  if (/Android/.test(agent)) return "android";
  if (/Safari/.test(agent) && !/Chrome|Chromium|Edg|OPR/.test(agent)) return "mac-safari";
  if (/Chrome|Chromium|Edg|OPR/.test(agent)) return "desktop";
  return "unsupported";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Whether SwiftPay can be installed here, and how. */
export function useInstallApp() {
  const hasPrompt = useSyncExternalStore(subscribe, () => Boolean(deferredPrompt), () => false);
  const justInstalled = useSyncExternalStore(subscribe, () => installed, () => false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
  }, []);

  return {
    /** Already running as the installed app. */
    installed: standalone || justInstalled,
    /** The browser offered its own install dialog. */
    canPrompt: hasPrompt,
    platform,
    async prompt() {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      emit();
      return choice.outcome === "accepted";
    },
  };
}

// ── Service worker ──────────────────────────────────────────────────────────

/**
 * Registers the service worker in production (or with NEXT_PUBLIC_ENABLE_SW=1).
 * In development it removes any old one, so hot reload never serves stale code.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (enabled) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    } else {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
    }
  }, []);
  return null;
}

// ── How-to for platforms without a prompt ───────────────────────────────────

const steps: Record<Exclude<Platform, "android" | "desktop">, { icon: typeof Share; text: string }[]> = {
  ios: [
    { icon: Share, text: "Tap the Share button in Safari's toolbar." },
    { icon: PlusSquare, text: "Scroll down and tap “Add to Home Screen”." },
    { icon: Smartphone, text: "Tap Add. SwiftPay opens from your home screen like any app." },
  ],
  "mac-safari": [
    { icon: Share, text: "In Safari's menu bar, choose File." },
    { icon: PlusSquare, text: "Choose “Add to Dock”, then Add." },
    { icon: MonitorDown, text: "SwiftPay opens from your Dock in its own window." },
  ],
  unsupported: [
    { icon: MonitorDown, text: "Open SwiftPay in Chrome or Edge on your computer, or Safari on iPhone." },
    { icon: Download, text: "Choose Install app (or Add to Home Screen)." },
  ],
};

function InstallGuide({ onOpenChange, open, platform }: { open: boolean; onOpenChange: (open: boolean) => void; platform: Platform }) {
  const guide =
    platform === "ios" || platform === "mac-safari" || platform === "unsupported"
      ? steps[platform]
      : [
          { icon: Download, text: "Open your browser's menu (⋮)." },
          { icon: PlusSquare, text: "Choose “Install app” or “Add to Home screen”." },
        ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Install SwiftPay</DialogTitle>
          <DialogDescription>
            {platform === "ios"
              ? "Add SwiftPay to your home screen in three taps."
              : platform === "unsupported"
                ? "This browser can't install apps."
                : "Keep SwiftPay one tap away."}
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {guide.map((step, index) => (
            <li className="flex items-start gap-3" key={step.text}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="h-4 w-4" />
              </span>
              <p className="pt-1.5 text-sm">
                <span className="font-semibold">{index + 1}.</span> {step.text}
              </p>
            </li>
          ))}
        </ol>
        {platform === "ios" ? (
          <p className="text-xs text-muted-foreground">
            On iPhone, use Safari (or the Share menu in Chrome on iOS 16.4 and later).
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────

/** One button that does the right thing on every platform. */
export function InstallAppButton({ className, label = "Install app" }: { className?: string; label?: string }) {
  const install = useInstallApp();
  const [guideOpen, setGuideOpen] = useState(false);
  if (!install.platform || install.installed) return null;

  return (
    <>
      <Button
        className={className}
        onClick={() => {
          if (install.canPrompt) void install.prompt();
          else setGuideOpen(true);
        }}
        type="button"
      >
        <Download className="h-4 w-4" />
        {install.canPrompt || install.platform === "android" || install.platform === "desktop" ? label : "How to install"}
      </Button>
      <InstallGuide onOpenChange={setGuideOpen} open={guideOpen} platform={install.platform} />
    </>
  );
}

const dismissKey = "swiftpay:install-banner-dismissed";

/** The dashboard's "Get the app" card: once, dismissible, never when installed. */
export function InstallAppBanner({ className }: { className?: string }) {
  const install = useInstallApp();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // Only where installing is actually possible (not e.g. Firefox desktop).
  const possible =
    install.canPrompt || install.platform === "ios" || install.platform === "android" || install.platform === "mac-safari";
  if (dismissed || install.installed || !install.platform || !possible) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      // Private mode: it'll show again next time.
    }
  }

  return (
    <aside
      className={cn(
        "relative flex items-center gap-4 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 pr-10",
        className,
      )}
    >
      <Image alt="" className="h-12 w-12 shrink-0 rounded-xl shadow-sm" height={48} src="/icons/apple-touch-icon.png" width={48} />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-semibold">Get the SwiftPay app</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {install.platform === "ios"
            ? "Add it to your home screen — full screen, one tap away."
            : "Install it for a faster, full-screen experience."}
        </p>
      </div>
      <InstallAppButton className="h-9 shrink-0 rounded-full px-4 text-sm" label="Install" />
      <button
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={dismiss}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}

/** A Settings row: always there (unless installed), for anyone who dismissed the card. */
export function InstallAppSettingsCard() {
  const install = useInstallApp();
  if (!install.platform) return null;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4">
      <Image alt="" className="h-12 w-12 rounded-xl" height={48} src="/icons/apple-touch-icon.png" width={48} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">SwiftPay app</p>
        <p className="text-sm text-muted-foreground">
          {install.installed
            ? "You're using the installed app."
            : "Install SwiftPay on this device — iPhone, Android or computer — and open it like any other app."}
        </p>
      </div>
      {install.installed ? null : <InstallAppButton />}
    </div>
  );
}
