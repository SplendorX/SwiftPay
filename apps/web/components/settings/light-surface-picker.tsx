"use client";

import { useEffect, useState } from "react";

import { useT } from "@/components/locale-provider";

export const lightSurfaceStorageKey = "swiftpay.light-surface";
export type LightSurface = "cream" | "glass";

export function applyLightSurface(surface: LightSurface) {
  document.documentElement.dataset.lightSurface = surface;
}

export function LightSurfacePicker() {
  const t = useT();
  const [surface, setSurface] = useState<LightSurface>("cream");

  useEffect(() => {
    const stored = window.localStorage.getItem(lightSurfaceStorageKey);
    const next: LightSurface = stored === "glass" ? "glass" : "cream";
    setSurface(next);
    applyLightSurface(next);
  }, []);

  function selectSurface(next: LightSurface) {
    setSurface(next);
    window.localStorage.setItem(lightSurfaceStorageKey, next);
    applyLightSurface(next);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          {
            value: "cream" as const,
            title: t("settings.cashmere"),
            body: t("settings.cashmereBody"),
            swatch: "#f4ebdd",
            inset: "#fff9f0",
          },
          {
            value: "glass" as const,
            title: t("settings.liquidGlass"),
            body: t("settings.liquidGlassBody"),
            swatch: "#f7f8fc",
            inset: "rgba(255,255,255,0.72)",
          },
        ] as const
      ).map((option) => {
        const active = surface === option.value;
        return (
          <button
            aria-pressed={active}
            className={`light-surface-preview ${active ? "light-surface-preview-active" : ""}`}
            key={option.value}
            onClick={() => selectSurface(option.value)}
            type="button"
          >
            <span
              className={`light-surface-swatch light-surface-swatch-${option.value}`}
              style={{ background: option.swatch }}
            >
              <span
                className="light-surface-swatch-pane"
                style={{ background: option.inset }}
              />
            </span>
            <span className="grid gap-0.5 text-left">
              <span className="text-sm font-semibold text-foreground">
                {option.title}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {option.body}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
