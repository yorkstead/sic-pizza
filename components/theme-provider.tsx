"use client";

import React, { createContext, useContext, useEffect, useState, useTransition, useSyncExternalStore } from "react";


export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "sic-theme";
const emptySubscribe = () => () => {};

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
}) {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return defaultTheme;
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (savedTheme === "system" || savedTheme === "light" || savedTheme === "dark") {
        return savedTheme;
      }
    } catch {
      // Ignore localStorage read errors
    }
    return defaultTheme;
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [, startTransition] = useTransition();



  // Update resolved theme and DOM classes when theme or system preference changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        theme === "dark" || (theme === "system" && getSystemTheme() === "dark");
      const currentResolved: ResolvedTheme = isDark ? "dark" : "light";

      setResolvedTheme(currentResolved);

      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(currentResolved);
      root.style.colorScheme = currentResolved;
    };

    updateTheme();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        startTransition(() => {
          updateTheme();
        });
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      if (newTheme === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, newTheme);
      }
    } catch {
      // Ignore localStorage write errors
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: isMounted ? resolvedTheme : "light",
        setTheme,
      }}
    >

      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Script injected into <head> to prevent theme flash (FOUC)
 */
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem("${STORAGE_KEY}");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = stored === "dark" || (stored === "system" && prefersDark);
    var root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");
    root.style.colorScheme = isDark ? "dark" : "light";
  } catch (e) {}
})();
`.trim();
