"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const themeStorageKey = "swiftpay.theme";
type ThemeMode = "dark" | "light";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-background/80 text-foreground shadow-sm transition hover:border-primary/30 hover:bg-background"
      onClick={() => selectTheme(nextTheme)}
      title={`Switch to ${nextTheme} mode`}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
