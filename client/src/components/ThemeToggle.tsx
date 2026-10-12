import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useTheme } from "@/lib/theme.ts";

// Switches between the light and dark theme and remembers the choice in this browser.
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      onClick={toggleTheme}
    >
      {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  );
}
