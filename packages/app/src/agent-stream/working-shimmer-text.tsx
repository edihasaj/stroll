import { useEffect, type ReactNode } from "react";
import { Text, View, type StyleProp, type TextStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { useAppReducedMotion } from "@/hooks/use-app-reduced-motion";

// Web: a bright window sweeping across the live-footer "Working" label (docs/design.md §16's
// Codex parity). The label is drawn once in full foreground; a wide veil the colour of the
// canvas lies over it, translucent everywhere except a soft clear window in its middle, and
// slides across with a transform. Only the veil moves, and a transform on a layer with a
// static gradient is pure compositor work.
// Two earlier versions cost far more while streaming: a gradient clipped to the text with an
// animated `background-position` repainted the text every frame (14% of a core), and a masked
// band carrying a bright copy of the text needed an extra render pass every frame (7%).
const WEB_SHIMMER_KEYFRAME_ID = "paseo-working-shimmer-keyframes";
const WEB_SHIMMER_ANIMATION_NAME = "paseo-working-shimmer";
// The veil is three label-widths wide. Sliding it from -2 widths to 0 carries the clear window
// (at its centre) from half a width before the label to half a width past it.
const WEB_SHIMMER_KEYFRAME_CSS = `
  @keyframes ${WEB_SHIMMER_ANIMATION_NAME} {
    from { transform: translateX(-66.667%); }
    to { transform: translateX(0); }
  }
`;

let webShimmerRegistered = false;

function ensureWebShimmerKeyframes(): void {
  if (!isWeb) {
    return;
  }
  if (webShimmerRegistered) {
    return;
  }
  if (document.getElementById(WEB_SHIMMER_KEYFRAME_ID)) {
    webShimmerRegistered = true;
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.id = WEB_SHIMMER_KEYFRAME_ID;
  styleElement.textContent = WEB_SHIMMER_KEYFRAME_CSS;
  document.head.appendChild(styleElement);
  webShimmerRegistered = true;
}

interface WorkingShimmerTextProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/** The live turn footer's "Working" label: a shimmering highlight sweep on web (the
 * animation itself is the running indicator — no separate spinner), a plain label inside
 * an opacity-pulsing wrapper on native. Reduced motion drops to a static label on both. */
export function WorkingShimmerText({
  children,
  style,
  testID,
}: WorkingShimmerTextProps): ReactNode {
  const reducedMotion = useAppReducedMotion();
  useEffect(() => {
    ensureWebShimmerKeyframes();
  }, []);
  if (isWeb && !reducedMotion) {
    return (
      <View style={webShimmerStyles.frame}>
        <Text style={[style, webShimmerStyles.label]} numberOfLines={1} testID={testID}>
          {children}
        </Text>
        <View style={webShimmerStyles.veil} aria-hidden />
      </View>
    );
  }
  if (!isWeb && !reducedMotion) {
    return (
      <NativeWorkingShimmerText style={style} testID={testID}>
        {children}
      </NativeWorkingShimmerText>
    );
  }
  return (
    <Text style={style} testID={testID}>
      {children}
    </Text>
  );
}

const webShimmerStyles = StyleSheet.create((theme) => {
  const veil = `color-mix(in srgb, ${theme.colors.surface0} 62%, transparent)`;
  return {
    frame: {
      position: "relative",
      overflow: "hidden",
    },
    label: {
      color: theme.colors.foreground,
    },
    veil: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: "300%",
      pointerEvents: "none",
      backgroundImage: `linear-gradient(90deg, ${veil} 0%, ${veil} 40%, transparent 50%, ${veil} 60%, ${veil} 100%)`,
      animationName: WEB_SHIMMER_ANIMATION_NAME,
      animationDuration: "1.6s",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      willChange: "transform",
    },
  };
});

// Reanimated-driven opacity lives on a plain wrapping `Animated.View` with a theme-free
// style, not on the themed `Text` itself — applying a `StyleSheet.create((theme) => ...)`
// style straight to a Reanimated-animated node crashes natively (docs/unistyles.md
// "Reanimated `Animated.View` + Dynamic Styles Crashes": Unistyles and Reanimated both try
// to mutate the same node). Keeping the animation and the theme on two different nodes
// sidesteps that entirely, with no `useUnistyles()` needed either (banned in new code).
function NativeWorkingShimmerText({ children, style, testID }: WorkingShimmerTextProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
    return () => cancelAnimation(opacity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={animatedStyle}>
      <Text style={style} testID={testID}>
        {children}
      </Text>
    </Animated.View>
  );
}
