import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  default as React,
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, Text, View } from "react-native";
import type {
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  buttonIconSize,
  createControlGeometry,
  type ButtonControlSize,
} from "@/components/ui/control-geometry";
import { isWeb } from "@/constants/platform";
import { useAppReducedMotion } from "@/hooks/use-app-reduced-motion";
import { MOTION_DURATION, type Theme } from "@/styles/theme";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = ButtonControlSize;

// Web-only CSS transitions (docs/ui-gap-gpt.md B3/M6) — press and hover snap on native RN
// regardless, since there is no continuous style interpolation without Reanimated; on web the
// underlying DOM node accepts plain `transition*` style keys the same way
// `adaptive-modal-sheet.tsx`'s overlay fade does. Kept as module-scope constants, not inside
// `StyleSheet.create`, so the reduced-motion check below can drop the duration to `0ms` without
// re-deriving the object per theme.
const WEB_PRESS_TRANSITION = isWeb
  ? ({
      transitionProperty: "opacity, transform",
      transitionTimingFunction: "ease-out",
    } as ViewStyle)
  : null;

const WEB_TEXT_TRANSITION = isWeb
  ? ({
      transitionProperty: "color",
      transitionTimingFunction: "ease-out",
    } as TextStyle)
  : null;

function webTransitionDuration(reducedMotion: boolean): string {
  return reducedMotion ? "0ms" : `${MOTION_DURATION.fast}ms`;
}

type LeftIcon =
  | ReactElement
  | ComponentType<{ color: string; size: number }>
  | ((color: string) => ReactElement)
  | null;

interface ButtonIconProps {
  loading: boolean;
  leftIcon?: LeftIcon;
  iconSize: number;
  iconColor: string;
}

function ButtonIcon({ loading, leftIcon, iconSize, iconColor }: ButtonIconProps) {
  if (loading) {
    return (
      <View>
        <LoadingSpinner size="small" color={iconColor} />
      </View>
    );
  }

  if (!leftIcon) return null;

  if (typeof leftIcon === "object" && "type" in leftIcon) {
    return <View>{leftIcon}</View>;
  }

  if (
    typeof leftIcon === "function" &&
    !leftIcon.prototype?.isReactComponent &&
    leftIcon.length > 0
  ) {
    return <View>{(leftIcon as (color: string) => ReactElement)(iconColor)}</View>;
  }

  const Icon = leftIcon as ComponentType<{ color: string; size: number }>;
  return (
    <View>
      <Icon color={iconColor} size={iconSize} />
    </View>
  );
}

const ThemedButtonIcon = withUnistyles(ButtonIcon);

const foregroundIconMapping = (theme: Theme) => ({ iconColor: theme.colors.foreground });
const foregroundMutedIconMapping = (theme: Theme) => ({
  iconColor: theme.colors.foregroundMuted,
});
const accentForegroundIconMapping = (theme: Theme) => ({
  iconColor: theme.colors.accentForeground,
});
const destructiveForegroundIconMapping = (theme: Theme) => ({
  iconColor: theme.colors.destructiveForeground,
});

const styles = StyleSheet.create((theme) => {
  const geometry = createControlGeometry(theme);
  const isLight = theme.colorScheme === "light";

  // Rest-state elevation per filled variant, composed once per theme so a focus ring can be
  // appended to the same chain instead of rebuilding the whole `boxShadow` string at render
  // time (RN style arrays override a key wholesale, they never merge two `boxShadow` strings
  // from two array entries). `default`/`destructive` share one filled-CTA shadow; `secondary`
  // differs by colour scheme per docs/design.md "Finish".
  const filledShadow = [theme.shadow.xs, theme.shadow.insetHighlight].join(", ");
  const secondaryShadow = isLight ? theme.shadow.xs : theme.shadow.insetHighlight;

  return {
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing[2],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: "transparent",
    },
    md: {
      ...geometry.buttonMd,
    },
    xs: {
      ...geometry.buttonXs,
    },
    sm: {
      ...geometry.buttonSm,
    },
    lg: {
      ...geometry.buttonLg,
    },
    // `default` — the one primary action per surface. Accent fill, a 1px hairline one shade
    // darker than the fill (the same alpha-black/white `border` token used everywhere else,
    // composited over accent it reads as "a touch darker," not a second colour), a soft top
    // highlight plus the smallest elevation step.
    default: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.border,
      boxShadow: filledShadow,
    },
    defaultHovered: {
      // Brighten, don't darken — a filled CTA lightens on hover against the page, the inverse
      // of a hairline control's hover treatment.
      opacity: 0.92,
    },
    defaultFocused: {
      borderColor: theme.colors.focusBorder,
      boxShadow: [filledShadow, theme.shadow.focusRing].join(", "),
    },
    // `secondary` — the paired action. Light sits as a raised white card on the warm chrome;
    // dark sits as a slightly raised panel with a top inner highlight instead of a shadow,
    // since a dark surface's own shadow barely reads.
    secondary: {
      backgroundColor: isLight ? theme.colors.surface0 : theme.colors.surface2,
      borderColor: theme.colors.border,
      boxShadow: secondaryShadow,
    },
    secondaryHovered: {
      borderColor: theme.colors.borderAccent,
    },
    secondaryFocused: {
      borderColor: theme.colors.focusBorder,
      boxShadow: [secondaryShadow, theme.shadow.focusRing].join(", "),
    },
    // `outline` — transparent until acted on. Hover fills with the same translucent wash used
    // by header/toolbar controls rather than a border-colour swap.
    outline: {
      backgroundColor: "transparent",
      borderColor: theme.colors.border,
    },
    outlineHovered: {
      backgroundColor: theme.colors.interactionHighlight,
    },
    outlineFocused: {
      borderColor: theme.colors.focusBorder,
      boxShadow: theme.shadow.focusRing,
    },
    ghost: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
    ghostFocused: {
      borderColor: theme.colors.focusBorder,
      boxShadow: theme.shadow.focusRing,
    },
    // `destructive` — the default/primary treatment with the destructive fill.
    destructive: {
      backgroundColor: theme.colors.destructive,
      borderColor: theme.colors.border,
      boxShadow: filledShadow,
    },
    destructiveHovered: {
      opacity: 0.92,
    },
    destructiveFocused: {
      borderColor: theme.colors.focusBorder,
      boxShadow: [filledShadow, theme.shadow.focusRing].join(", "),
    },
    // Press reads as scale, not a deeper fill or a flat opacity drop — the same curve icon
    // buttons use (icon-button-chrome.ts). Disabled stays the only opacity-only state.
    pressed: {
      transform: [{ scale: 0.98 }],
    },
    disabled: {
      opacity: theme.opacity[50],
    },
    text: {
      color: theme.colors.foreground,
      ...geometry.buttonText,
      fontWeight: theme.fontWeight.normal,
    },
    textXs: {
      ...geometry.buttonTextXs,
    },
    // The one filled CTA per surface earns the structural-label weight and a hair of negative
    // tracking — every other button stays `normal`/untracked (docs/design.md "Finish" and §14).
    textDefault: {
      color: theme.colors.accentForeground,
      fontWeight: theme.fontWeight.medium,
      letterSpacing: theme.textTracking.button,
    },
    textDestructive: {
      color: theme.colors.destructiveForeground,
    },
    textGhost: {
      color: theme.colors.foregroundMuted,
    },
    textGhostHovered: {
      color: theme.colors.foreground,
    },
  };
});

export function Button({
  children,
  variant = "secondary",
  size = "md",
  leftIcon,
  trailing,
  style,
  textStyle,
  disabled,
  loading = false,
  accessibilityRole,
  accessibilityState: accessibilityStateProp,
  onFocus,
  onBlur,
  ...props
}: PropsWithChildren<
  Omit<PressableProps, "style"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leftIcon?: LeftIcon;
    trailing?: ReactNode;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
    loading?: boolean;
  }
>) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isDisabled = disabled || loading;
  const reducedMotion = useAppReducedMotion();

  let variantStyle: ViewStyle;
  let variantHoverStyle: ViewStyle | null;
  let variantFocusedStyle: ViewStyle;
  if (variant === "default") {
    variantStyle = styles.default;
    variantHoverStyle = styles.defaultHovered;
    variantFocusedStyle = styles.defaultFocused;
  } else if (variant === "secondary") {
    variantStyle = styles.secondary;
    variantHoverStyle = styles.secondaryHovered;
    variantFocusedStyle = styles.secondaryFocused;
  } else if (variant === "outline") {
    variantStyle = styles.outline;
    variantHoverStyle = styles.outlineHovered;
    variantFocusedStyle = styles.outlineFocused;
  } else if (variant === "ghost") {
    variantStyle = styles.ghost;
    variantHoverStyle = null;
    variantFocusedStyle = styles.ghostFocused;
  } else {
    variantStyle = styles.destructive;
    variantHoverStyle = styles.destructiveHovered;
    variantFocusedStyle = styles.destructiveFocused;
  }

  let sizeStyle: ViewStyle;
  if (size === "xs") {
    sizeStyle = styles.xs;
  } else if (size === "sm") {
    sizeStyle = styles.sm;
  } else if (size === "lg") {
    sizeStyle = styles.lg;
  } else {
    sizeStyle = styles.md;
  }
  const isGhostHovered = hovered && variant === "ghost";

  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  // Tracks focus the same way `ComboboxTrigger` does (components/ui/combobox-trigger.tsx) —
  // `onFocus`/`onBlur` rather than a true `:focus-visible` distinction, since RN has no cross-
  // platform seam for "keyboard focus only." Forward the caller's own handlers so this doesn't
  // silently swallow one, same as the hover handlers below.
  const handleFocus = useCallback<NonNullable<PressableProps["onFocus"]>>(
    (event) => {
      setFocused(true);
      onFocus?.(event);
    },
    [onFocus],
  );
  const handleBlur = useCallback<NonNullable<PressableProps["onBlur"]>>(
    (event) => {
      setFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  // Web transition duration lives here (not in the static `WEB_PRESS_TRANSITION` object) so
  // reduced motion can drop it to `0ms` without re-deriving the transition property list.
  const webPressTransition = useMemo(
    () =>
      WEB_PRESS_TRANSITION
        ? { ...WEB_PRESS_TRANSITION, transitionDuration: webTransitionDuration(reducedMotion) }
        : null,
    [reducedMotion],
  );
  const webTextTransition = useMemo(
    () =>
      WEB_TEXT_TRANSITION
        ? { ...WEB_TEXT_TRANSITION, transitionDuration: webTransitionDuration(reducedMotion) }
        : null,
    [reducedMotion],
  );

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [
      styles.base,
      webPressTransition,
      sizeStyle,
      variantStyle,
      hovered && !isDisabled ? variantHoverStyle : null,
      focused && !isDisabled ? variantFocusedStyle : null,
      pressed ? styles.pressed : null,
      isDisabled ? styles.disabled : null,
      style,
    ],
    [
      sizeStyle,
      variantStyle,
      variantHoverStyle,
      variantFocusedStyle,
      hovered,
      focused,
      isDisabled,
      style,
      webPressTransition,
    ],
  );

  const resolvedTextStyle = useMemo(
    () => [
      styles.text,
      webTextTransition,
      size === "xs" ? styles.textXs : null,
      variant === "default" ? styles.textDefault : null,
      variant === "destructive" ? styles.textDestructive : null,
      variant === "ghost" ? styles.textGhost : null,
      textStyle,
      isGhostHovered ? styles.textGhostHovered : null,
    ],
    [size, variant, textStyle, isGhostHovered, webTextTransition],
  );

  const accessibilityState = useMemo(
    () => ({ ...accessibilityStateProp, disabled: isDisabled, busy: loading }),
    [accessibilityStateProp, isDisabled, loading],
  );

  function resolveIconMapping() {
    if (variant === "default") {
      return accentForegroundIconMapping;
    }
    if (variant === "destructive") {
      return destructiveForegroundIconMapping;
    }
    if (variant === "ghost") {
      return isGhostHovered ? foregroundIconMapping : foregroundMutedIconMapping;
    }
    return foregroundIconMapping;
  }

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={accessibilityState}
      disabled={isDisabled}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={pressableStyle}
    >
      <ThemedButtonIcon
        loading={loading}
        leftIcon={leftIcon}
        iconSize={buttonIconSize[size]}
        uniProps={resolveIconMapping()}
      />
      {children != null ? <Text style={resolvedTextStyle}>{children}</Text> : null}
      {trailing}
    </Pressable>
  );
}
