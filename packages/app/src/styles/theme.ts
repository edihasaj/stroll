import { Platform, type FontVariant } from "react-native";
import { Easing } from "react-native-reanimated";
import { darkHighlightColors, lightHighlightColors } from "@getpaseo/highlight";

export const baseColors = {
  // Base colors
  white: "#ffffff",
  black: "#000000",

  // Zinc scale (primary gray palette)
  zinc: {
    50: "#fafafa",
    100: "#f4f4f5",
    200: "#e4e4e7",
    300: "#d4d4d8",
    400: "#a1a1aa",
    500: "#71717a",
    600: "#52525b",
    700: "#3f3f46",
    800: "#27272a",
    850: "#1a1a1d",
    900: "#18181b",
    950: "#121214",
  },

  // Gray scale
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Slate scale
  slate: {
    200: "#e2e8f0",
  },

  // Blue scale
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },

  // Green scale
  green: {
    100: "#dcfce7",
    200: "#bbf7d0",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    800: "#166534",
    900: "#14532d",
  },

  // Red scale
  red: {
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    500: "#ef4444",
    600: "#dc2626",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  // Teal scale
  teal: {
    200: "#99f6e4",
  },

  // Amber scale
  amber: {
    500: "#f59e0b",
    700: "#b45309",
  },

  // Yellow scale
  yellow: {
    400: "#fbbf24",
  },

  // Purple scale
  purple: {
    500: "#a855f7",
    600: "#9333ea",
  },

  // Orange scale
  orange: {
    500: "#f97316",
    600: "#ea580c",
  },
} as const;

// Diff colors — the +/- inside a diff view, where the color *is* the signal and has to
// survive being scanned line by line, so it stays saturated. Light uses muted tones, dark
// uses the brighter palette values.
//
// A diff *stat* — the "+12 −3" footnote next to a title — is not this. It is a status
// signal, so it uses statusSuccess/statusDanger below rather than a tier of its own.
const lightDiffColors = {
  diffAddition: "#15803d", // green-700 — readable on white without screaming
  diffDeletion: "#b91c1c", // red-700
};

const darkDiffColors = {
  diffAddition: "#4ade80", // green-400
  diffDeletion: "#ef4444", // red-500
};

// Status colors — semantic signals for success/danger/warning/merged. There is exactly one
// token per signal, and every status surface uses it: PR state icons, CI check icons and
// pies, diff stats, file-change icons, status badges, usage bars. Status *dots* are the
// exception and have their own band below. A surface does not otherwise get a quieter or
// louder variant of a status color because of where it sits — if a dense list feels loud,
// that is a density or weight problem, not a color problem.
//
// The level is set by the densest consumer, the sidebar workspace list: quiet enough that a
// column of green checks reads as one line of subtitle and the single red row still stands
// out, saturated enough to name the state on its own. Every other surface follows it.
//
// Normalized, not hand-picked. Every color below shares one lightness and one chroma; only
// the hue changes, and each hue is the one that family already had. Chroma is a fixed
// fraction of what sRGB allows at that lightness and hue, because the gamut is lopsided —
// amber runs out of room long before red does, so a literal equal-chroma set leaves amber
// flat and red screaming. Equal fractions is what makes four hues read as one family.
// Regenerate with the same rule rather than nudging one value.
//
// Hues are fixed per family across both themes: success 150, danger 27, warning 70.5,
// merged 300.
const lightStatusColors = {
  // L=0.50, chroma 60% of gamut max
  statusSuccess: "#3e704a",
  statusDanger: "#9d433b",
  statusWarning: "#7b5d39",
  statusMerged: "#7347af",
};

const darkStatusColors = {
  // L=0.70, chroma 55% of gamut max
  statusSuccess: "#6cb17b",
  statusDanger: "#d8847b",
  statusWarning: "#c09664",
  statusMerged: "#a890d5",
};

// Status *dot* colors — the small filled discs on a sidebar row, and the glyphs that stand in
// for them. Same four hues and the same generation rule as the status colors above, but its
// own band, because a dot is doing a different job than a check icon or a host badge.
//
// A dot is 6pt of solid color with no shape to read and no label attached. At the status
// band's lightness the dots read dimmer than the static text and icons beside them on the same
// row, which is backwards — the dot is the row's state. The loudness comes from chroma: 90% of
// gamut max against the status family's 55-60%.
//
// Lightness is set by hue separation, not by distance from the surface. A dark dot on a light
// surface has plenty of contrast but the four hues collapse into each other at 6pt — dark green,
// dark red, dark amber and dark blue all read as "dark blob", and the point of the dot is telling
// them apart at a glance. So the light band runs as bright as the contrast floor allows: L=0.62
// is the last step where all four clear 3:1 against the sidebar's surface2 (success is the
// binding one at 3.10, and drops under 3 by L=0.64), which is WCAG's non-text minimum for a
// control that carries state.
//
// All four move together. A dot matching its siblings in lightness and chroma says only which
// state the row is in; one that does not says "this row matters more", which is a claim the
// color has no business making. Regenerate the set, never one hue.
//
// 90% and not 100%: at the gamut edge the lopsidedness is worst — green reaches C=0.215 while
// blue manages 0.116 — so the set stops reading as one family and green wins. Red running out
// of chroma as lightness climbs is what caps the dark band at L=0.72; higher turns the failed
// dot pink, and the light band pastels out the same way just above its own cap. Running is blue
// at hue 250, clear of
// identity-colors' blue at 256.6 so a blue host badge and a working dot on the same row do not
// read as related.
const lightStatusDotColors = {
  // L=0.62, chroma 90% of gamut max
  statusDotSuccess: "#299f51",
  statusDotDanger: "#f12e2f",
  statusDotWarning: "#b37824",
  statusDotRunning: "#268ae0",
};

const darkStatusDotColors = {
  // L=0.72, chroma 90% of gamut max
  statusDotSuccess: "#35c264",
  statusDotDanger: "#f7796d",
  statusDotWarning: "#db932e",
  statusDotRunning: "#5caaf6",
};

// Alpha hairlines — composited over whatever surface draws beneath them, so one set works
// for every built-in theme (Paper light, and every dark tint) without a per-tint hex. A
// tint's hue still reads through: compositing white/black over a colored surface lightens
// or darkens toward it rather than desaturating to neutral grey, so e.g. Paseo's
// teal-tinted dark surfaces still show a teal-leaning hairline, and Midnight's blue-tinted
// ones a blue-leaning one. `border` is the default hairline (cards, inputs, pane
// dividers); `borderAccent` is the strong/hover/focus-adjacent variant (outline button,
// picker panels); `borderDivider` is the softer row-separator inside a card — one step
// quieter than `border` because it separates rows that already belong together, not two
// different things. See docs/design.md "Finish".
const LIGHT_BORDER = "rgba(15, 15, 15, 0.08)";
const LIGHT_BORDER_ACCENT = "rgba(15, 15, 15, 0.14)";
const LIGHT_BORDER_DIVIDER = "rgba(15, 15, 15, 0.06)";
const DARK_BORDER = "rgba(255, 255, 255, 0.07)";
const DARK_BORDER_ACCENT = "rgba(255, 255, 255, 0.12)";
const DARK_BORDER_DIVIDER = "rgba(255, 255, 255, 0.05)";

/** `#rgb`/`#rrggbb` only — every accent in this file is a plain hex triplet. Used to build
 * the accent-tinted `focusRing`/`focusBorder` tokens per theme. */
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface LightThemeConfig {
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surfaceDiffEmpty: string;
  surfaceSidebar: string;
  foreground: string;
  foregroundMuted: string;
  foregroundExtraMuted: string;
  /** Overrides the alpha-hairline default. Only plugin-contributed themes (whose author
   * chose a solid border hex as part of their palette contract) should set this. */
  border?: string;
  borderAccent?: string;
  accent: string;
  accentBright: string;
  accentForeground?: string;
  primary: string;
  primaryForeground: string;
  destructive: string;
  terminalBlack: string;
  terminalBrightBlack: string;
  ring: string;
  /**
   * The bubble/wash surface used for the user's own chat messages. Defaults to `surface2` —
   * set it only when a tint wants that surface to read differently from the rest of the
   * secondary chrome (sidebar hover, cards) that also derives from `surface2`.
   */
  secondary?: string;
}

const lightTerminalAnsi = {
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#ffffff",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#f59e0b",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#fafafa",
} as const;

export function buildLightSemanticColors(tint: LightThemeConfig) {
  return {
    surface0: tint.surface0,
    surface1: tint.surface1,
    surface2: tint.surface2,
    surface3: tint.surface3,
    surface4: tint.surface4,
    surfaceDiffEmpty: tint.surfaceDiffEmpty,
    surfaceSidebar: tint.surfaceSidebar,
    surfaceSidebarHover: tint.surface1,
    surfaceSidebarSelected: tint.surface3,
    surfaceWorkspace: tint.surface0,
    interactionHighlight: "rgba(0, 0, 0, 0.06)",

    foreground: tint.foreground,
    foregroundMuted: tint.foregroundMuted,
    foregroundExtraMuted: tint.foregroundExtraMuted,

    border: tint.border ?? LIGHT_BORDER,
    borderAccent: tint.borderAccent ?? LIGHT_BORDER_ACCENT,
    borderDivider: LIGHT_BORDER_DIVIDER,

    accent: tint.accent,
    accentBright: tint.accentBright,
    accentForeground: tint.accentForeground ?? tint.surface0,

    destructive: tint.destructive,
    destructiveForeground: tint.surface0,
    success: tint.accent,
    successForeground: tint.surface0,

    background: tint.surface0,
    popover: tint.surface0,
    popoverForeground: tint.foreground,
    primary: tint.primary,
    primaryForeground: tint.primaryForeground,
    secondary: tint.secondary ?? tint.surface2,
    secondaryForeground: tint.foreground,
    muted: tint.surface2,
    mutedForeground: tint.foregroundMuted,
    accentBorder: tint.borderAccent ?? LIGHT_BORDER_ACCENT,
    input: tint.surface2,
    ring: tint.ring,

    ...lightDiffColors,
    ...lightStatusColors,
    ...lightStatusDotColors,

    terminal: {
      background: tint.surface0,
      foreground: tint.foreground,
      cursor: tint.foreground,
      cursorAccent: tint.surface0,
      selectionBackground: "rgba(0, 0, 0, 0.15)",
      selectionForeground: tint.foreground,
      black: tint.terminalBlack,
      ...lightTerminalAnsi,
      brightBlack: tint.terminalBrightBlack,
    },
  };
}

// Light — warm off-white chrome (sidebar, cards, dividers) around a pure white working
// surface, with hairline borders instead of shadows to separate them. The user's own chat
// bubble washes in a light cool/green tint instead of following the shared secondary surface.
const lightSemanticColors = buildLightSemanticColors({
  surface0: "#ffffff",
  surface1: "#f7f7f5",
  surface2: "#f1f1ef",
  surface3: "#e6e6e3",
  surface4: "#d8d8d4",
  surfaceDiffEmpty: "#f5f5f2",
  surfaceSidebar: "#f1f1ef",
  foreground: "#1c1c1c",
  foregroundMuted: "#6b6b6b",
  foregroundExtraMuted: "#9c9c94",
  accent: "#20744A",
  accentBright: "#239956",
  accentForeground: "#ffffff",
  primary: "#1c1c1c",
  primaryForeground: "#f7f7f5",
  destructive: "#b04138",
  terminalBlack: "#1c1c1c",
  terminalBrightBlack: "#4a4a45",
  ring: "#1c1c1c",
  // Cool/green wash for the user's own message bubble, distinct from the warm-neutral
  // surface2 that the rest of the secondary chrome shares.
  secondary: "#eef6f3",
});

// ---------------------------------------------------------------------------
// Dark theme variant builder
// ---------------------------------------------------------------------------

export interface DarkThemeConfig {
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surfaceDiffEmpty: string;
  surfaceSidebar: string;
  foregroundMuted: string;
  foregroundExtraMuted: string;
  /** Overrides the alpha-hairline default. Only plugin-contributed themes (whose author
   * chose a solid border hex as part of their palette contract) should set this. */
  border?: string;
  borderAccent?: string;
  accent: string;
  accentBright: string;
  accentForeground?: string;
  destructive: string;
  terminalBlack: string;
  terminalBrightBlack: string;
  foreground?: string;
  ring?: string;
}

const darkTerminalAnsi = {
  red: "#e07070",
  green: "#5dba80",
  yellow: "#d4a44a",
  blue: "#6a9de0",
  magenta: "#b07ad0",
  cyan: "#4aabb8",
  white: "#d4d4d8",
  brightRed: "#e89090",
  brightGreen: "#7ecf9a",
  brightYellow: "#e0be6e",
  brightBlue: "#8ab4e8",
  brightMagenta: "#c49ae0",
  brightCyan: "#6ec2cc",
  brightWhite: "#f0f0f2",
} as const;

export function buildDarkSemanticColors(tint: DarkThemeConfig) {
  // Pure white on a near-black surface reads as glare at prose sizes; zinc-200 keeps the
  // contrast ratio well past AA while losing the halo.
  const foreground = tint.foreground ?? "#e4e4e7";
  const ring = tint.ring ?? "#d4d4d8";
  return {
    surface0: tint.surface0,
    surface1: tint.surface1,
    surface2: tint.surface2,
    surface3: tint.surface3,
    surface4: tint.surface4,
    surfaceDiffEmpty: tint.surfaceDiffEmpty,
    surfaceSidebar: tint.surfaceSidebar,
    surfaceSidebarHover: tint.surface1,
    surfaceSidebarSelected: tint.surface2,
    surfaceWorkspace: tint.surface1,
    interactionHighlight: "rgba(255, 255, 255, 0.08)",

    foreground,
    foregroundMuted: tint.foregroundMuted,
    foregroundExtraMuted: tint.foregroundExtraMuted,

    border: tint.border ?? DARK_BORDER,
    borderAccent: tint.borderAccent ?? DARK_BORDER_ACCENT,
    borderDivider: DARK_BORDER_DIVIDER,

    accent: tint.accent,
    accentBright: tint.accentBright,
    accentForeground: tint.accentForeground ?? "#ffffff",

    destructive: tint.destructive,
    destructiveForeground: "#ffffff",
    success: tint.accent,
    successForeground: "#ffffff",

    // Legacy aliases (for gradual migration)
    background: tint.surface0,
    popover: tint.surface2,
    popoverForeground: foreground,
    primary: foreground,
    primaryForeground: tint.surface0,
    secondary: tint.surface2,
    secondaryForeground: foreground,
    muted: tint.surface2,
    mutedForeground: tint.foregroundMuted,
    accentBorder: tint.borderAccent ?? DARK_BORDER_ACCENT,
    input: tint.surface2,
    ring,

    ...darkDiffColors,
    ...darkStatusColors,
    ...darkStatusDotColors,

    terminal: {
      background: tint.surface0,
      foreground,
      cursor: foreground,
      cursorAccent: tint.surface0,
      selectionBackground: "rgba(255, 255, 255, 0.2)",
      selectionForeground: foreground,
      black: tint.terminalBlack,
      ...darkTerminalAnsi,
      brightBlack: tint.terminalBrightBlack,
    },
  };
}

// ---------------------------------------------------------------------------
// Dark tint definitions
// ---------------------------------------------------------------------------

// Paseo — subtle teal-green tint (default)
const paseoDarkColors = buildDarkSemanticColors({
  // Same depth as the neutral ramp, hue held: the tint is the brand, the lightness was only
  // ever chrome. Lifting the surfaces off near-black is what made the old set read as grey.
  surface0: "#0F1211",
  surface1: "#141817",
  surface2: "#1A1E1D",
  surface3: "#262A29",
  surface4: "#363938",
  surfaceDiffEmpty: "#171A19",
  surfaceSidebar: "#0B0E0D",
  foregroundMuted: "#8E9291",
  foregroundExtraMuted: "#5F6362",
  accent: "#20744A",
  accentBright: "#7ccba0",
  destructive: "#c64f43", // warm red, hue ~7 — reads as red (not pink) against the green tint
  terminalBlack: "#141716",
  terminalBrightBlack: "#434645",
});

// Zinc — neutral gray, no tint
const zincDarkColors = buildDarkSemanticColors({
  // The ramp starts at zinc-950 rather than zinc-900: an editor chrome that sits a step above
  // black lets the elevations above it separate without any of them turning grey.
  surface0: "#0e0e10",
  surface1: "#131315",
  surface2: "#18181a",
  surface3: "#232327",
  surface4: "#2e2e33",
  surfaceDiffEmpty: "#151517",
  surfaceSidebar: "#0a0a0c",
  foregroundMuted: "#7f7f87",
  foregroundExtraMuted: "#5a5a61",
  accent: "#e4e4e7",
  accentBright: "#fafafa",
  accentForeground: "#18181b", // monochrome zinc accent is near-white — needs dark text
  destructive: "#c44a4a", // neutral red, hue 0 — clearly red without screaming
  terminalBlack: "#131316",
  terminalBrightBlack: "#3f3f46",
});

// Midnight — subtle blue tint
const midnightDarkColors = buildDarkSemanticColors({
  surface0: "#161820",
  surface1: "#1c1e27",
  surface2: "#252731",
  surface3: "#3c3e4c",
  surface4: "#535564",
  surfaceDiffEmpty: "#222430",
  surfaceSidebar: "#121420",
  foregroundMuted: "#9a9db0",
  foregroundExtraMuted: "#6b6e82",
  accent: "#3b6fcf",
  accentBright: "#7eaaeb",
  destructive: "#c44a52", // red with a hint of cool lean against the blue tint
  terminalBlack: "#121420",
  terminalBrightBlack: "#3c3e4c",
});

// Claude — warm neutral with subtle orange undertone
const claudeDarkColors = buildDarkSemanticColors({
  surface0: "#1f1f1e",
  surface1: "#262523",
  surface2: "#2f2d2b",
  surface3: "#4a4745",
  surface4: "#605d5b",
  surfaceDiffEmpty: "#2a2826",
  surfaceSidebar: "#1a1918",
  foregroundMuted: "#ada9a5",
  foregroundExtraMuted: "#78746f",
  accent: "#d97757",
  accentBright: "#e89a7f",
  destructive: "#cf513e", // warm orange-red, hue ~10 — sits with the Claude orange accent
  terminalBlack: "#1a1918",
  terminalBrightBlack: "#4a4745",
});

// Ghostty — blue-tinted dark based on Ghostty default background
const ghosttyDarkColors = buildDarkSemanticColors({
  surface0: "#282c34",
  surface1: "#2f333d",
  surface2: "#383c48",
  surface3: "#4a4f5e",
  surface4: "#5b6175",
  surfaceDiffEmpty: "#323643",
  surfaceSidebar: "#21252d",
  foregroundMuted: "#c8ccd8",
  foregroundExtraMuted: "#a0a4b2",
  accent: "#89b4fa",
  accentBright: "#b4d0fc",
  destructive: "#c44a55", // red with slight cool lean against the slate-blue surfaces
  terminalBlack: "#21252d",
  terminalBrightBlack: "#4a4f5e",
});

export const SPACING = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

export const FONT_SIZE = {
  code: 12,
  // Chat prose and the composer share one metric; 14 is the size the rest of the scale is
  // built around, and 15 left the two a pixel apart for no reason a reader can see.
  content: 14,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 18,
  "2xl": 20,
  "3xl": 22,
  "4xl": 26,
} as const;

export const LINE_HEIGHT = {
  diff: 22,
} as const;

export const ICON_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
} as const;

export const FONT_WEIGHT = {
  normal: "normal" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "bold" as const,
} as const;

// Tracking for small uppercase structural labels (sidebar section headers). One value: a
// label this small reads as a run-together blob without it, and there is exactly one place
// in the app small enough to need it.
export const LETTER_SPACING = {
  wide: 0.4,
} as const;

// Tight tracking for headings ≥18px (fontSize.xl and up). RN `letterSpacing` is absolute
// px, not em, so each step is computed per size rather than one shared em value: 18px→-0.2,
// 20px/22px→-0.3, 26px→-0.4. Use the step matching the text's `fontSize` token; this is a
// heading-only tightening — body and label text stay untracked, and `wide` above is
// unrelated (small-caps labels get looser, not tighter). See docs/design.md "Finish".
export const TEXT_TRACKING = {
  wide: LETTER_SPACING.wide,
  tightXl: -0.2, // fontSize.xl (18)
  tight2xl: -0.3, // fontSize["2xl"] (20)
  tight3xl: -0.3, // fontSize["3xl"] (22)
  tight4xl: -0.4, // fontSize["4xl"] (26)
  // The primary button label only (`<Button variant="default">`) — a hair past -0.005em at
  // fontSize.base (14), so the one filled CTA per surface reads slightly denser than every
  // other button's untracked label. See docs/design.md "Finish".
  button: -0.07,
} as const;

// `fontVariant` helper for counts, timestamps, diff stats, and token counts — anywhere
// digits sit in a column or update in place and must not shift width as they change.
export const tabularNums: { fontVariant: FontVariant[] } = { fontVariant: ["tabular-nums"] };

export const BORDER_RADIUS = {
  none: 0,
  sm: 3,
  base: 5,
  md: 8,
  lg: 10,
  xl: 14,
  "2xl": 18,
  full: 9999,
} as const;

export const BORDER_WIDTH = {
  0: 0,
  1: 1,
  2: 2,
} as const;

export const OPACITY = {
  0: 0,
  50: 0.5,
  100: 1,
} as const;

// Motion — the app's one animation system (`react-native-reanimated`; see docs/design.md
// "Motion"). `fast`/`base` are the menu overlay's existing open/close keyframe durations
// (`packages/app/src/styles/motion.ts`'s `openClose*`); `slow` is the scroll-to-bottom pill's
// fade duration (`appear*`). Every new `entering`/`exiting`/`withTiming` call reuses one of
// these two shapes instead of a bespoke duration.
export const MOTION_DURATION = {
  fast: 100,
  base: 150,
  slow: 200,
} as const;

// Reanimated's `Keyframe` interpolates each step with `Easing.linear` unless a step sets its
// own curve — the menu overlay's entering/exiting keyframes never set one, so `standard` names
// that implicit default instead of leaving every future call site to rediscover it.
export const MOTION_EASING = {
  standard: Easing.linear,
} as const;

// Platform default font stacks. Geist/Geist Mono lead every stack (vendored under
// `packages/app/assets/fonts/geist/` and `public/fonts/geist/`, SIL OFL 1.1 — see
// docs/design.md "Finish"); the previous platform-native stacks stay as the fallback
// chain for the instant before a weight loads on web, or if a build ever ships without
// the fonts linked. These seed the dynamic `fontFamily` theme token and are the fallback
// an empty user-supplied family resolves to at apply time.
export const DEFAULT_UI_FONT_STACK: string = Platform.select({
  ios: "Geist, system-ui",
  default: "Geist, normal",
  web: "Geist, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
});

export const DEFAULT_MONO_FONT_STACK: string = Platform.select({
  ios: "Geist Mono, ui-monospace",
  default: "Geist Mono, monospace",
  web: "Geist Mono, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
});

// The serif stack the "Prose font" appearance setting resolves to when the user picks
// "Serif". Only readable content (Markdown bodies, the user's own chat text, PR prose) reads
// this token — composer input, code, controls, and the sidebar stay on `fontFamily.ui`/`mono`.
export const DEFAULT_SERIF_FONT_STACK: string = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "'Iowan Old Style', 'Palatino Linotype', Charter, Georgia, 'Times New Roman', serif",
  web: "'Iowan Old Style', 'Palatino Linotype', Charter, Georgia, 'Times New Roman', serif",
});

/** The "Prose font" appearance setting. "system" mirrors `fontFamily.ui`; "serif" resolves to
 * `DEFAULT_SERIF_FONT_STACK`. */
export type ProseFontPreference = "system" | "serif";

// `fontSize`, `fontFamily`, and `lineHeight` are deliberately widened to plain
// `number`/`string` (not narrowed by `as const`) so the appearance updater can patch
// them at runtime via `UnistylesRuntime.updateTheme`. The remaining tokens keep their
// literal types.
interface CommonTheme {
  spacing: typeof SPACING;
  fontSize: Record<keyof typeof FONT_SIZE, number>;
  fontFamily: { ui: string; mono: string; content: string };
  lineHeight: Record<keyof typeof LINE_HEIGHT, number>;
  iconSize: typeof ICON_SIZE;
  fontWeight: typeof FONT_WEIGHT;
  letterSpacing: typeof LETTER_SPACING;
  textTracking: typeof TEXT_TRACKING;
  tabularNums: typeof tabularNums;
  borderRadius: typeof BORDER_RADIUS;
  borderWidth: typeof BORDER_WIDTH;
  opacity: typeof OPACITY;
  motion: {
    duration: typeof MOTION_DURATION;
    easing: typeof MOTION_EASING;
  };
}

const commonTheme: CommonTheme = {
  spacing: SPACING,
  fontSize: FONT_SIZE,
  // Seeded to the UI stack ("system"); `applyAppearance` patches this to the serif stack when
  // the persisted "Prose font" setting is "serif".
  fontFamily: {
    ui: DEFAULT_UI_FONT_STACK,
    mono: DEFAULT_MONO_FONT_STACK,
    content: DEFAULT_UI_FONT_STACK,
  },
  lineHeight: LINE_HEIGHT,
  iconSize: ICON_SIZE,
  fontWeight: FONT_WEIGHT,
  letterSpacing: LETTER_SPACING,
  textTracking: TEXT_TRACKING,
  tabularNums,
  borderRadius: BORDER_RADIUS,
  borderWidth: BORDER_WIDTH,
  opacity: OPACITY,
  motion: {
    duration: MOTION_DURATION,
    easing: MOTION_EASING,
  },
};

// Elevation — layered `boxShadow` strings, not shadowColor/shadowOffset/shadowRadius/
// elevation objects. RN 0.81's new architecture (`newArchEnabled` in app.config.js)
// renders the CSS `boxShadow` string on `View` on every platform Paseo ships from this
// checkout (iOS, Android, web, Electron), so one string per step covers all of them.
// `md`/`lg` each carry a 1px ring ahead of the soft falloff — elevation reads as a ring
// plus blur, never a heavy border. `xs` is the smallest lift (a quiet trigger barely off
// the page plane); `sm`/`md`/`lg` are the previous scale's call sites, unchanged in which
// component uses which step. Dark keeps the same geometry with roughly 3x the alpha,
// since a black shadow needs far more opacity to read on a dark surface, and its ring
// flips to a light hairline (`rgba(255,255,255,0.06)`) since a black ring would vanish
// against a dark surface. See docs/design.md "Finish".
const DARK_SHADOW = {
  xs: "0 1px 2px rgba(0, 0, 0, 0.15)",
  sm: "0 1px 2px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.12)",
  md: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.24), 0 12px 32px -8px rgba(0, 0, 0, 0.30)",
  lg: "0 0 0 1px rgba(255, 255, 255, 0.06), 0 24px 64px -12px rgba(0, 0, 0, 0.66)",
  // Raised surfaces (cards, panels): a 1px lightening right at the top inner edge, as if
  // lit from above. Compose alongside the elevation step, not instead of it:
  // `boxShadow: [theme.shadow.md, theme.shadow.insetHighlight].join(", ")`.
  insetHighlight: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
} as const;

export function buildDarkTheme(semanticColors: ReturnType<typeof buildDarkSemanticColors>) {
  return {
    colorScheme: "dark" as const,
    colors: {
      ...semanticColors,
      palette: baseColors,
      syntax: darkHighlightColors,
      // 1px ring colour for a focused control's edge, paired with `shadow.focusRing` for
      // the glow outside it. Accent at ~55% alpha — see docs/design.md "Finish".
      focusBorder: hexToRgba(semanticColors.accent, 0.55),
    },
    shadow: {
      ...DARK_SHADOW,
      // The focused-control glow: a 3px ring in the theme's own accent at ~22% alpha, so
      // every tint's focus state reads as "this theme's accent," not one fixed blue.
      focusRing: `0 0 0 3px ${hexToRgba(semanticColors.accent, 0.22)}`,
    },
    ...commonTheme,
  } as const;
}

export const darkTheme = buildDarkTheme(paseoDarkColors);
export const darkZincTheme = buildDarkTheme(zincDarkColors);
export const darkMidnightTheme = buildDarkTheme(midnightDarkColors);
export const darkClaudeTheme = buildDarkTheme(claudeDarkColors);
export const darkGhosttyTheme = buildDarkTheme(ghosttyDarkColors);

// Pure black — zero-luminance background with high-contrast surfaces.
const pureBlackDarkColors = buildDarkSemanticColors({
  surface0: "#000000",
  surface1: "#0a0a0a",
  surface2: "#111111",
  surface3: "#202020",
  surface4: "#2d2d2d",
  surfaceDiffEmpty: "#0c0c0c",
  surfaceSidebar: "#000000",
  foregroundMuted: "#a1a1aa",
  foregroundExtraMuted: "#71717a",
  accent: "#20744A",
  accentBright: "#7ccba0",
  destructive: "#c44a4a",
  terminalBlack: "#595959",
  terminalBrightBlack: "#8a8a8a",
});

export const darkPureBlackTheme = buildDarkTheme(pureBlackDarkColors);

// See the `DARK_SHADOW` comment above — same layered-`boxShadow` rule, light geometry.
const LIGHT_SHADOW = {
  xs: "0 1px 2px rgba(16, 16, 16, 0.05)",
  sm: "0 1px 2px rgba(16, 16, 16, 0.06), 0 1px 3px rgba(16, 16, 16, 0.04)",
  md: "0 0 0 1px rgba(16, 16, 16, 0.05), 0 4px 12px -2px rgba(16, 16, 16, 0.08), 0 12px 32px -8px rgba(16, 16, 16, 0.10)",
  lg: "0 0 0 1px rgba(16, 16, 16, 0.05), 0 24px 64px -12px rgba(16, 16, 16, 0.22)",
  insetHighlight: "inset 0 1px 0 rgba(255, 255, 255, 0.6)",
} as const;

export function buildLightTheme(semanticColors: ReturnType<typeof buildLightSemanticColors>) {
  return {
    colorScheme: "light" as const,
    colors: {
      ...semanticColors,
      palette: baseColors,
      syntax: lightHighlightColors,
      focusBorder: hexToRgba(semanticColors.accent, 0.55),
    },
    shadow: {
      ...LIGHT_SHADOW,
      focusRing: `0 0 0 3px ${hexToRgba(semanticColors.accent, 0.22)}`,
    },
    ...commonTheme,
  } as const;
}

export const lightTheme = buildLightTheme(lightSemanticColors);

// Keep compatibility with existing code
export const theme = darkTheme;

export const THEME_OPTIONS = [
  {
    name: "light",
    group: "primary",
    unistylesName: "light",
    theme: lightTheme,
    swatch: "#ffffff",
  },
  {
    name: "dark",
    group: "primary",
    unistylesName: "dark",
    theme: darkTheme,
    swatch: "#2D8B62",
  },
  { name: "auto", group: "primary" },
  {
    name: "zinc",
    group: "variant",
    unistylesName: "darkZinc",
    theme: darkZincTheme,
    swatch: "#808080",
  },
  {
    name: "midnight",
    group: "variant",
    unistylesName: "darkMidnight",
    theme: darkMidnightTheme,
    swatch: "#4A6BA8",
  },
  {
    name: "claude",
    group: "variant",
    unistylesName: "darkClaude",
    theme: darkClaudeTheme,
    swatch: "#D97757",
  },
  {
    name: "ghostty",
    group: "variant",
    unistylesName: "darkGhostty",
    theme: darkGhosttyTheme,
    swatch: "#8caaee",
  },
  {
    name: "pureBlack",
    group: "variant",
    unistylesName: "darkPureBlack",
    theme: darkPureBlackTheme,
    swatch: "#000000",
  },
] as const;

export const PLUGIN_THEME_PREFERENCE = "plugin";
export const PLUGIN_THEME_NAMES = {
  light: "pluginLight",
  dark: "pluginDark",
} as const;

export type ThemePreference =
  | (typeof THEME_OPTIONS)[number]["name"]
  | typeof PLUGIN_THEME_PREFERENCE;
export type ThemeName = Exclude<ThemePreference, "auto" | typeof PLUGIN_THEME_PREFERENCE>;
type ConcreteThemeOption = Exclude<(typeof THEME_OPTIONS)[number], { name: "auto" }>;
export type Theme = ConcreteThemeOption["theme"];

const CONCRETE_THEME_OPTIONS = THEME_OPTIONS.filter(
  (option): option is ConcreteThemeOption => option.name !== "auto",
);

type ThemeToUnistyles = {
  [Name in ThemeName]: Extract<ConcreteThemeOption, { name: Name }>["unistylesName"];
};

type ThemeSwatches = {
  [Name in ThemeName]: Extract<ConcreteThemeOption, { name: Name }>["swatch"];
};

type RegisteredThemes = {
  [Option in ConcreteThemeOption as Option["unistylesName"]]: Option["theme"];
} & {
  pluginLight: typeof lightTheme;
  pluginDark: typeof darkTheme;
};

export const THEME_TO_UNISTYLES = Object.fromEntries(
  CONCRETE_THEME_OPTIONS.map((option) => [option.name, option.unistylesName]),
) as ThemeToUnistyles;

export const THEME_SWATCHES = Object.fromEntries(
  CONCRETE_THEME_OPTIONS.map((option) => [option.name, option.swatch]),
) as ThemeSwatches;

export const REGISTERED_THEMES = {
  ...Object.fromEntries(
    CONCRETE_THEME_OPTIONS.map((option) => [option.unistylesName, option.theme]),
  ),
  [PLUGIN_THEME_NAMES.light]: lightTheme,
  [PLUGIN_THEME_NAMES.dark]: darkTheme,
} as RegisteredThemes;

export function getNextThemePreference(current: ThemePreference): ThemePreference {
  const currentIndex = THEME_OPTIONS.findIndex((option) => option.name === current);
  const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
  return THEME_OPTIONS[nextIndex]?.name ?? THEME_OPTIONS[0].name;
}
