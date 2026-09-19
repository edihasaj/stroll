import { Easing } from "react-native-reanimated";
import { describe, expect, it } from "vitest";
import {
  darkPureBlackTheme,
  darkTheme,
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_SERIF_FONT_STACK,
  DEFAULT_UI_FONT_STACK,
  FONT_SIZE,
  getNextThemePreference,
  lightTheme,
  MOTION_DURATION,
  MOTION_EASING,
  THEME_OPTIONS,
} from "./theme";

describe("Typography scale", () => {
  it("names 14px as the default interface tier", () => {
    expect(FONT_SIZE).toEqual({
      code: 12,
      content: 14,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    });
  });
});

describe("Motion tokens", () => {
  it("names the three durations every entering/exiting call site shares", () => {
    expect(MOTION_DURATION).toEqual({ fast: 100, base: 150, slow: 200 });
  });

  it("names the menu overlay's implicit Keyframe curve (Reanimated's Linear default)", () => {
    expect(MOTION_EASING.standard).toBe(Easing.linear);
  });

  it("is available on every registered theme, alongside spacing/radius/opacity", () => {
    expect(darkTheme.motion.duration).toBe(MOTION_DURATION);
    expect(lightTheme.motion.duration).toBe(MOTION_DURATION);
    expect(darkTheme.motion.easing).toBe(MOTION_EASING);
  });
});

describe("Prose font token", () => {
  it("seeds fontFamily.content to the UI stack by default, distinct from mono", () => {
    expect(darkTheme.fontFamily.content).toBe(DEFAULT_UI_FONT_STACK);
    expect(lightTheme.fontFamily.content).toBe(DEFAULT_UI_FONT_STACK);
    expect(darkTheme.fontFamily.content).not.toBe(DEFAULT_MONO_FONT_STACK);
  });

  it("defines a dedicated serif stack for the Prose font setting", () => {
    expect(typeof DEFAULT_SERIF_FONT_STACK).toBe("string");
    expect(DEFAULT_SERIF_FONT_STACK.length).toBeGreaterThan(0);
    expect(DEFAULT_SERIF_FONT_STACK).not.toBe(DEFAULT_UI_FONT_STACK);
  });
});

describe("Theme catalog", () => {
  it("owns the picker and shortcut order", () => {
    expect(THEME_OPTIONS.map((option) => option.name)).toEqual([
      "light",
      "dark",
      "auto",
      "zinc",
      "midnight",
      "claude",
      "ghostty",
      "pureBlack",
    ]);
    expect(getNextThemePreference("dark")).toBe("auto");
    expect(getNextThemePreference("auto")).toBe("zinc");
    expect(getNextThemePreference("pureBlack")).toBe("light");
  });
});

describe("Pure black theme", () => {
  it("uses a pure black application and terminal background", () => {
    expect(darkPureBlackTheme.colors.surface0).toBe("#000000");
    expect(darkPureBlackTheme.colors.background).toBe("#000000");
    expect(darkPureBlackTheme.colors.terminal.background).toBe("#000000");
  });

  it("uses Paseo's muted green accent", () => {
    expect(darkPureBlackTheme.colors.accent).toBe("#20744A");
    expect(darkPureBlackTheme.colors.accentBright).toBe("#7ccba0");
  });

  it("derives sidebar interaction surfaces from the surface scale", () => {
    expect(darkPureBlackTheme.colors.surfaceSidebar).toBe("#000000");
    expect(darkPureBlackTheme.colors.surfaceSidebarHover).toBe(darkPureBlackTheme.colors.surface1);
    expect(darkPureBlackTheme.colors.surfaceSidebarSelected).toBe(
      darkPureBlackTheme.colors.surface2,
    );
  });

  it("keeps ANSI black output readable on its zero-luminance terminal background", () => {
    expect(darkPureBlackTheme.colors.terminal.black).toBe("#595959");
    expect(darkPureBlackTheme.colors.terminal.brightBlack).toBe("#8a8a8a");
  });
});

describe("Sidebar interaction surfaces", () => {
  it("keeps Light selection distinct from the sidebar surface", () => {
    expect(lightTheme.colors.surfaceSidebarHover).toBe(lightTheme.colors.surface1);
    expect(lightTheme.colors.surfaceSidebarSelected).toBe(lightTheme.colors.surface3);
    expect(lightTheme.colors.surfaceSidebarSelected).not.toBe(lightTheme.colors.surfaceSidebar);
  });

  it("derives Dark hover and selection from the first two raised surfaces", () => {
    expect(darkTheme.colors.surfaceSidebarHover).toBe(darkTheme.colors.surface1);
    expect(darkTheme.colors.surfaceSidebarSelected).toBe(darkTheme.colors.surface2);
  });
});

describe("Built-in light theme", () => {
  it("preserves its authored aliases and terminal contrast through the semantic builder", () => {
    expect(lightTheme.colors).toMatchObject({
      primary: "#1c1c1c",
      primaryForeground: "#f7f7f5",
      destructiveForeground: "#ffffff",
      successForeground: "#ffffff",
      terminal: {
        black: "#1c1c1c",
        brightBlack: "#4a4a45",
      },
    });
  });

  it("keeps a pure white main surface with warm off-white secondary surfaces", () => {
    expect(lightTheme.colors.surface0).toBe("#ffffff");
    expect(lightTheme.colors.surface1).toBe("#f7f7f5");
    expect(lightTheme.colors.surfaceSidebar).toBe("#f1f1ef");
  });

  it("washes the user message bubble in a cool/green tint distinct from surface2", () => {
    expect(lightTheme.colors.secondary).toBe("#eef6f3");
    expect(lightTheme.colors.secondary).not.toBe(lightTheme.colors.surface2);
  });
});
