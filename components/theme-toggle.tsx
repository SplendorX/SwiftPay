"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const themeStorageKey = "swiftpay.theme";
type ThemeMode = "dark" | "light";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const storedTheme =
      window.localStorage.getItem(themeStorageKey) === "dark"
        ? "dark"
        : "light";

    setTheme(storedTheme);
    applyTheme(storedTheme);
  }, []);

  function selectTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
    applyTheme(nextTheme);
  }

  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={isDark}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-lavender-200 bg-white/80 text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-swift-600 hover:bg-white hover:text-swift-700 active:translate-y-0"
      onClick={() => selectTheme(nextTheme)}
      title={`Switch to ${nextTheme} mode`}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
