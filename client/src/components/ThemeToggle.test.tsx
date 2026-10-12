import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/ThemeToggle.tsx";
import { initTheme, themeStorageKey } from "@/lib/theme.ts";

const root = document.documentElement;

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    root.classList.remove("dark");
  });

  afterEach(() => {
    localStorage.clear();
    root.classList.remove("dark");
  });

  test("switches to dark and back, remembering the choice", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(root.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(themeStorageKey)).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(root.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(themeStorageKey)).toBe("light");
  });

  test("starts from the theme already on the page", () => {
    root.classList.add("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});

describe("initTheme", () => {
  afterEach(() => {
    localStorage.clear();
    root.classList.remove("dark");
  });

  test("applies the stored choice", () => {
    localStorage.setItem(themeStorageKey, "dark");
    initTheme();
    expect(root.classList.contains("dark")).toBe(true);

    localStorage.setItem(themeStorageKey, "light");
    initTheme();
    expect(root.classList.contains("dark")).toBe(false);
  });
});
