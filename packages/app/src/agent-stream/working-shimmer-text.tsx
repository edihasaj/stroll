import { useEffect, type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
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

// Web: a moving gradient clipped to the text (the live-footer "Working · 2m 41s" shimmer,
// docs/design.md §16's Codex parity). This is the turn footer's own small, self-contained
// keyframe injection — the pattern mirrors `startup-splash-screen.tsx`'s logo shimmer, but
// is independent of it (that one masks an SVG mark, not text).
const WEB_SHIMMER_KEYFRAME_ID = "paseo-working-shimmer-keyframes";
const WEB_SHIMMER_ANIMATION_NAME = "paseo-working-shimmer";
const WEB_SHIMMER_KEYFRAME_CSS = `
  @keyframes ${WEB_SHIMMER_ANIMATION_NAME} {
    to { background-position: -200% 0; }
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

/** The live turn footer's "Working" label: a shimmering gradient sweep on web (the
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
      <Text style={[style, webShimmerStyles.gradient]} testID={testID}>
        {children}
      </Text>
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

const webShimmerStyles = StyleSheet.create((theme) => ({
  gradient: {
    backgroundImage: `linear-gradient(90deg, ${theme.colors.foregroundExtraMuted} 0%, ${theme.colors.foreground} 50%, ${theme.colors.foregroundExtraMuted} 100%)`,
    backgroundSize: "200% 100%",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    animationName: WEB_SHIMMER_ANIMATION_NAME,
    animationDuration: "1.6s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
}));

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
