import { forwardRef, useMemo, type ComponentProps, type ReactElement, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import { isWeb } from "@/constants/platform";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";

export interface FloatingSurfaceProps extends Omit<ComponentProps<typeof Animated.View>, "style"> {
  frameStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Every caller renders this behind an `if (!open) return null` one level up — `MenuOverlay`
 * (`menu-overlay.tsx`), `Combobox`, `tooltip.tsx`'s trigger context, `workspace-hover-card.tsx`.
 * That owner and this surface unmount in the same React commit, so on web an `exiting` Keyframe
 * has no live parent left to intercept the removal: Reanimated's web layout-animation runtime
 * clones the outgoing node out of a tree that React is still tearing down, and a later frame's
 * `_updatePropsJS` throws `Cannot convert undefined or null to object` against the now-detached
 * clone. That throw is untrapped (it fires from a rAF/animation callback, not from React's render
 * or event path) and has been observed to swallow an unrelated click delivered right after.
 * Fabric's native layout-animation runtime handles the same simultaneous ancestor+descendant
 * removal without issue, so this only strips `exiting` on web. Entering is unaffected — mounting
 * never races an ancestor's removal.
 */
export const FloatingSurface = forwardRef<View, FloatingSurfaceProps>(function FloatingSurface(
  { frameStyle, style, exiting, ...props },
  ref,
): ReactElement {
  const inlineFrameStyle = useMemo(() => {
    const flattened = StyleSheet.flatten(frameStyle);
    return flattened ? inlineUnistylesStyle(stripUnistylesMetadata(flattened)) : undefined;
  }, [frameStyle]);
  const surfaceStyle = useMemo(
    () => appendStyle(style, inlineFrameStyle),
    [inlineFrameStyle, style],
  );
  return (
    <Animated.View
      {...props}
      exiting={isWeb ? undefined : exiting}
      ref={ref}
      style={surfaceStyle}
    />
  );
});

export interface FloatingScrollViewProps {
  bounces?: boolean;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
  showsVerticalScrollIndicator?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FloatingScrollView({
  bounces,
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  showsVerticalScrollIndicator,
  style,
}: FloatingScrollViewProps): ReactElement {
  const inlineStyle = useMemo(() => {
    const flattened = StyleSheet.flatten(style);
    return flattened ? inlineUnistylesStyle(stripUnistylesMetadata(flattened)) : undefined;
  }, [style]);

  return (
    <ScrollView
      bounces={bounces}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      style={inlineStyle}
    >
      {children}
    </ScrollView>
  );
}

function appendStyle(
  style: StyleProp<ViewStyle>,
  extraStyle: ViewStyle | undefined,
): StyleProp<ViewStyle> {
  if (!extraStyle) {
    return style;
  }
  if (Array.isArray(style)) {
    return [...style, extraStyle];
  }
  return [style, extraStyle];
}

function stripUnistylesMetadata(style: ViewStyle): ViewStyle {
  const cleanStyle: Record<string, unknown> = { ...style };
  for (const key of Object.keys(cleanStyle)) {
    if (key.startsWith("unistyles_")) {
      delete cleanStyle[key];
    }
  }
  return cleanStyle as ViewStyle;
}
