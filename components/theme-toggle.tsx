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

  return (
    <div className="inline-flex rounded-lg border border-lavender-200 bg-white/80 p-1 shadow-sm">
      <button
        aria-pressed={theme === "light"}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition ${
          theme === "light"
            ? "bg-ink text-white shadow-sm"
            : "text-muted hover:bg-white hover:text-swift-700"
        }`}
        onClick={() => selectTheme("light")}
        type="button"
      >
        <Sun className="h-4 w-4" />
        Light
      </button>
      <button
        aria-pressed={theme === "dark"}
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition ${
          theme === "dark"
            ? "bg-ink text-white shadow-sm"
            : "text-muted hover:bg-white hover:text-swift-700"
        }`}
        onClick={() => selectTheme("dark")}
        type="button"
      >
        <Moon className="h-4 w-4" />
        Dark
      </button>
    </div>
  );
}
