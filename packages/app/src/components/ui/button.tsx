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

  return {
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing[2],
      borderRadius: theme.borderRadius.lg,
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
    default: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    secondary: {
      backgroundColor: theme.colors.surface3,
      borderColor: theme.colors.surface3,
    },
    outline: {
      backgroundColor: "transparent",
      borderColor: theme.colors.borderAccent,
    },
    ghost: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
    destructive: {
      backgroundColor: theme.colors.destructive,
      borderColor: theme.colors.destructive,
    },
    pressed: {
      opacity: 0.85,
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
    textDefault: {
      color: theme.colors.accentForeground,
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
  const isDisabled = disabled || loading;
  const reducedMotion = useAppReducedMotion();

  let variantStyle: ViewStyle;
  if (variant === "default") {
    variantStyle = styles.default;
  } else if (variant === "secondary") {
    variantStyle = styles.secondary;
  } else if (variant === "outline") {
    variantStyle = styles.outline;
  } else if (variant === "ghost") {
    variantStyle = styles.ghost;
  } else {
    variantStyle = styles.destructive;
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
      pressed ? styles.pressed : null,
      isDisabled ? styles.disabled : null,
      style,
    ],
    [sizeStyle, variantStyle, isDisabled, style, webPressTransition],
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
