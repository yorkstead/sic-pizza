"use client";

import * as React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme, type ThemeMode } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  variant?: "segmented" | "compact";
  size?: "sm" | "default";
}

export function ThemeToggle({
  className,
  variant = "segmented",
  size = "sm",
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const options: Array<{ mode: ThemeMode; label: string; icon: React.ReactNode }> = [
    {
      mode: "system",
      label: "System",
      icon: <Laptop className={size === "sm" ? "size-3.5" : "size-4"} />,
    },
    {
      mode: "light",
      label: "Light",
      icon: <Sun className={size === "sm" ? "size-3.5" : "size-4"} />,
    },
    {
      mode: "dark",
      label: "Dark",
      icon: <Moon className={size === "sm" ? "size-3.5" : "size-4"} />,
    },
  ];

  if (variant === "compact") {
    // Quick cycling button
    const cycleTheme = () => {
      if (theme === "system") setTheme("light");
      else if (theme === "light") setTheme("dark");
      else setTheme("system");
    };

    return (
      <button
        type="button"
        onClick={cycleTheme}
        className={cn(
          "inline-flex items-center justify-center rounded-lg border bg-card p-2 text-foreground shadow-xs transition hover:bg-secondary active:scale-95 focus-visible:outline-2 focus-visible:outline-primary",
          className
        )}
        title={`Current theme: ${theme} (${resolvedTheme}). Click to cycle.`}
        aria-label={`Current theme: ${theme}. Click to change theme.`}
      >
        {theme === "system" ? (
          <div className="relative flex items-center justify-center">
            <Laptop className="size-4 text-muted-foreground" />
            <span
              className={cn(
                "absolute -top-1 -right-1 size-2 rounded-full",
                resolvedTheme === "dark" ? "bg-amber-400" : "bg-orange-500"
              )}
            />
          </div>
        ) : theme === "light" ? (
          <Sun className="size-4 text-amber-500" />
        ) : (
          <Moon className="size-4 text-indigo-400" />
        )}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border bg-card/80 p-1 text-muted-foreground backdrop-blur-xs",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = theme === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setTheme(opt.mode)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all",
              isSelected
                ? "bg-primary text-primary-foreground shadow-xs font-extrabold"
                : "hover:bg-secondary hover:text-foreground"
            )}
            title={`Set theme to ${opt.label}${opt.mode === "system" ? ` (Currently ${resolvedTheme})` : ""}`}
          >
            {opt.icon}
            <span className={cn(size === "sm" ? "text-[11px]" : "text-xs")}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
