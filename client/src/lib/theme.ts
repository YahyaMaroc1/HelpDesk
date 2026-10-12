import { useState } from "react";

export type Theme = "light" | "dark";

// The viewer's choice, kept per browser. Without one, the app follows the operating system's setting.
export const themeStorageKey = "theme";

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(themeStorageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Storage can be blocked (e.g. some private windows).
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The `.dark` class on <html> switches styles.css to the dark tokens.
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Called once in main.tsx before the first render, so the page never flashes the other theme.
export function initTheme() {
  applyTheme(storedTheme() ?? systemTheme());
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // The choice still applies for this visit.
    }
    setTheme(next);
  }

  return { theme, toggleTheme };
}
