import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";
import { isWeb } from "@/constants/platform";
import { ICON_SIZE, MOTION_DURATION } from "@/styles/theme";

export { extraMutedIconColorMapping, mutedIconColorMapping } from "@/components/ui/icon-color";

// Web-only ease for the hover fill and press scale (docs/ui-gap-gpt.md B2/B3/M6). This module is
// a plain style factory, not a component, so it has no `useAppReducedMotion()` seam of its own —
// `reducedMotion` is an explicit opt-in for callers that already read the hook themselves.
//
// Kept out of the Unistyles `StyleSheet.create` factory below on purpose: `transitionProperty`/
// `transitionDuration`/`transitionTimingFunction` aren't part of Unistyles' `UnistylesValues`
// type (nor RN's `ViewStyle`), and a value typed against either inside that factory poisons the
// whole factory's structural inference — see `adaptive-modal-sheet.tsx`'s `desktopOverlayStyle`
// for the same keys used the same way, outside any Unistyles factory. `iconButtonChromeStyle`
// layers this in as a plain array entry instead.
const WEB_TRANSITION = isWeb
  ? ({
      transitionProperty: "background-color, transform",
      transitionDuration: `${MOTION_DURATION.fast}ms`,
      transitionTimingFunction: "ease-out",
    } as ViewStyle)
  : null;

const WEB_TRANSITION_NONE = isWeb ? ({ transitionDuration: "0ms" } as ViewStyle) : null;

export type IconButtonChromeSize = "large" | "small";

const SMALL_ICON_BUTTON_SIZE = 20;
const COMPACT_SMALL_ICON_BUTTON_SIZE = 32;

export interface IconButtonChromeState {
  hovered?: boolean;
  pressed?: boolean;
  open?: boolean;
  active?: boolean;
  /** Keyboard (or native) focus — draws `theme.shadow.focusRing` around the circle without
   * changing its fill, so a tabbed-to icon button stays legible on its own hover/open state. */
  focused?: boolean;
}

function resolveIconButtonFrame(size: IconButtonChromeSize, compact: boolean) {
  if (size === "large") return styles.large;
  return compact ? styles.smallCompact : styles.small;
}

interface IconButtonChromeOptions {
  size: IconButtonChromeSize;
  state?: IconButtonChromeState;
  compact?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Drops the press scale and hover-fill transition to an instant `0ms` (docs/design.md
   * "Motion"). This module has no hook of its own, so a caller that already reads
   * `useAppReducedMotion()` passes the result straight through; omitted, motion plays normally.
   */
  reducedMotion?: boolean;
}

/** Shared hitbox and interaction chrome for icon-only header and toolbar controls. */
export function iconButtonChromeStyle({
  size,
  state,
  compact = false,
  disabled = false,
  style,
  reducedMotion = false,
}: IconButtonChromeOptions): StyleProp<ViewStyle> {
  const highlighted = state?.active || state?.hovered || state?.pressed || state?.open;
  return [
    resolveIconButtonFrame(size, compact),
    reducedMotion ? WEB_TRANSITION_NONE : WEB_TRANSITION,
    style,
    highlighted ? styles.highlighted : null,
    // Press gets its own scale on top of the shared hover/open/active fill (docs/ui-gap-gpt.md
    // B3): a circular icon button reads a fill-only press as no feedback at all, since the fill
    // is often already there from hover.
    state?.pressed ? styles.pressed : null,
    // Focus draws a ring, not a fill change (docs/design.md "Finish") — it composes on top of
    // the highlighted/pressed fill instead of replacing it, so tabbing to an already-hovered
    // button doesn't look like it lost its hover state.
    state?.focused ? styles.focused : null,
    disabled ? styles.disabled : null,
  ];
}

/** Frame-only form for non-interactive placeholders that must preserve header alignment. */
export function iconButtonChromeFrameStyle(
  size: IconButtonChromeSize,
  compact = false,
): StyleProp<ViewStyle> {
  return resolveIconButtonFrame(size, compact);
}

export function iconButtonChromeGlyphSize(size: IconButtonChromeSize, compact = false): number {
  if (size === "large") return ICON_SIZE.md;
  return compact ? 18 : 14;
}

export function smallIconButtonChromeFrameSize(compact = false): number {
  return compact ? COMPACT_SMALL_ICON_BUTTON_SIZE : SMALL_ICON_BUTTON_SIZE;
}

const styles = StyleSheet.create((theme) => ({
  large: {
    width: {
      xs: 32,
      md: HEADER_CONTROL_HEIGHT,
    },
    height: {
      xs: 32,
      md: HEADER_CONTROL_HEIGHT,
    },
    padding: 0,
    // `full` on a square frame renders as a circle sized to the touch target, not the glyph
    // (docs/ui-gap-gpt.md B2). Transparent at rest, so the shape is invisible until `highlighted`
    // fills it — this is a frame property, not a decoration drawn on top of it.
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  small: {
    width: SMALL_ICON_BUTTON_SIZE,
    height: SMALL_ICON_BUTTON_SIZE,
    padding: 0,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  smallCompact: {
    width: COMPACT_SMALL_ICON_BUTTON_SIZE,
    height: COMPACT_SMALL_ICON_BUTTON_SIZE,
    padding: 0,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  highlighted: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  // Press reads as scale, not a deeper fill — the fill is already claimed by hover/open/active
  // (docs/ui-gap-gpt.md B3). Disabled stays opacity-only and never combines with this.
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  focused: {
    boxShadow: theme.shadow.focusRing,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
}));
