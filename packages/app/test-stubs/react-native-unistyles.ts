import { Easing } from "react-native-reanimated";

const testTheme = {
  colorScheme: "light",
  colors: {
    foreground: "#111111",
    foregroundMuted: "#666666",
    statusSuccess: "#15803d",
    statusDanger: "#b91c1c",
    statusWarning: "#d97706",
    statusMerged: "#7c3aed",
    // The light band's values, so a test can name the colour it expects.
    statusDotSuccess: "#299f51",
    statusDotDanger: "#f12e2f",
    statusDotWarning: "#b37824",
    statusDotRunning: "#268ae0",
    accent: "#2563eb",
    accentForeground: "#ffffff",
    destructive: "#dc2626",
    destructiveForeground: "#ffffff",
    surface1: "#fafafa",
    surface2: "#f4f4f5",
    surface3: "#e4e4e7",
    background: "#ffffff",
    // Alpha hairlines — see theme.ts "Finish" border constants.
    border: "rgba(15, 15, 15, 0.08)",
    borderAccent: "rgba(15, 15, 15, 0.14)",
    borderDivider: "rgba(15, 15, 15, 0.06)",
    focusBorder: "rgba(37, 99, 235, 0.55)",
    interactionHighlight: "rgba(0, 0, 0, 0.06)",
    palette: {
      amber: { 500: "#f59e0b" },
      blue: { 300: "#93c5fd" },
      green: { 500: "#22c55e" },
      red: { 300: "#fca5a5" },
      white: "#ffffff",
    },
  },
  borderWidth: { 1: 1 },
  spacing: [0, 4, 8, 12, 16, 20, 24, 28, 32],
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
  },
  fontFamily: {
    ui: "Geist, sans-serif",
    mono: "Geist Mono, monospace",
    content: "Geist, sans-serif",
  },
  fontWeight: {
    normal: "400",
    medium: "500",
  },
  borderRadius: {
    none: 0,
    sm: 3,
    base: 5,
    md: 8,
    lg: 10,
    xl: 14,
    "2xl": 18,
    full: 9999,
  },
  letterSpacing: { wide: 0.4 },
  textTracking: {
    wide: 0.4,
    tightXl: -0.2,
    tight2xl: -0.3,
    tight3xl: -0.3,
    tight4xl: -0.4,
  },
  tabularNums: { fontVariant: ["tabular-nums"] },
  iconSize: { xs: 12, sm: 16, md: 20 },
  opacity: { 50: 0.5 },
  motion: {
    duration: { fast: 100, base: 150, slow: 200 },
    easing: { standard: Easing.linear },
  },
  // Layered `boxShadow` strings — see theme.ts "Finish" shadow constants.
  shadow: {
    xs: "0 1px 2px rgba(16, 16, 16, 0.05)",
    sm: "0 1px 2px rgba(16, 16, 16, 0.06), 0 1px 3px rgba(16, 16, 16, 0.04)",
    md: "0 0 0 1px rgba(16, 16, 16, 0.05), 0 4px 12px -2px rgba(16, 16, 16, 0.08), 0 12px 32px -8px rgba(16, 16, 16, 0.10)",
    lg: "0 0 0 1px rgba(16, 16, 16, 0.05), 0 24px 64px -12px rgba(16, 16, 16, 0.22)",
    insetHighlight: "inset 0 1px 0 rgba(255, 255, 255, 0.6)",
    focusRing: "0 0 0 3px rgba(37, 99, 235, 0.22)",
  },
};

type StyleFactory<T> = (theme: typeof testTheme) => T;

function isStyleFactory<T>(styles: T | StyleFactory<T>): styles is StyleFactory<T> {
  return typeof styles === "function";
}

export const StyleSheet = {
  create: <T>(styles: T | StyleFactory<T>): T =>
    isStyleFactory(styles) ? styles(testTheme) : styles,
};

export const withUnistyles = <T>(Component: T): T => Component;

export const useUnistyles = () => ({
  theme: testTheme,
  rt: {},
  breakpoint: undefined,
});

export const UnistylesRuntime = {
  setTheme: () => undefined,
  themeName: "light",
};
