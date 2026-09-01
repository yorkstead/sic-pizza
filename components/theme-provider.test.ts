import { describe, it, expect } from "bun:test";

import { THEME_INIT_SCRIPT } from "./theme-provider";

describe("Theme System & Script Verification", () => {
  it("exports a valid anti-flicker init script", () => {
    expect(THEME_INIT_SCRIPT).toBeDefined();
    expect(THEME_INIT_SCRIPT).toContain("sic-theme");
    expect(THEME_INIT_SCRIPT).toContain("prefers-color-scheme");
    expect(THEME_INIT_SCRIPT).toContain("document.documentElement");
    expect(THEME_INIT_SCRIPT).toContain("classList");
  });

  it("handles storage logic correctly in init script string", () => {
    expect(THEME_INIT_SCRIPT).toContain('root.classList.add(isDark ? "dark" : "light")');
    expect(THEME_INIT_SCRIPT).toContain('root.style.colorScheme = isDark ? "dark" : "light"');
  });
});
