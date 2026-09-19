import React, { useEffect } from "react";
import type { ActivityIndicatorProps } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import { useAppReducedMotion } from "@/hooks/use-app-reduced-motion";
import type { Theme } from "@/styles/theme";

interface LoadingSpinnerProps {
  color: string;
  size?: ActivityIndicatorProps["size"];
  style?: ActivityIndicatorProps["style"];
}

// Matches ActivityIndicator's iOS metrics so swapping the primitive does not
// resize any of the 150+ call sites that pass "small" / "large".
const SMALL_DIAMETER = 20;
const LARGE_DIAMETER = 36;
const STROKE_WIDTH = 1.5;
const THIN_STROKE_WIDTH = 1.25;
const THIN_DIAMETER_CEILING = 14;
// A quarter-turn arc reads as a spinner without the "pac-man" look a half
// circle gets at this stroke weight.
const ARC_FRACTION = 0.25;
const ROTATION_DURATION_MS = 900;

function resolveDiameter(size: LoadingSpinnerProps["size"]): number {
  if (typeof size === "number") return size;
  return size === "large" ? LARGE_DIAMETER : SMALL_DIAMETER;
}

// react-native-svg takes stroke as a plain prop rather than a style, so the
// theme-reactive track colour goes through withUnistyles (docs/unistyles.md #3).
const ThemedTrackCircle = withUnistyles(Circle, (theme: Theme) => ({
  stroke: theme.colors.border,
}));

/**
 * A thin rotating arc over a full track ring — the Codex/OpenClaw loading
 * mark. `color` is the arc; the track is always `theme.colors.border`.
 */
export function LoadingSpinner({ color, size = "small", style }: LoadingSpinnerProps) {
  const diameter = resolveDiameter(size);
  const strokeWidth = diameter <= THIN_DIAMETER_CEILING ? THIN_STROKE_WIDTH : STROKE_WIDTH;
  const radius = (diameter - strokeWidth) / 2;
  const center = diameter / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * ARC_FRACTION;

  const reduceMotion = useAppReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      return;
    }
    rotation.value = withRepeat(
      withTiming(360, { duration: ROTATION_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[{ width: diameter, height: diameter }, animatedStyle, style]}
      accessible
      accessibilityRole="progressbar"
    >
      <Svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
        <ThemedTrackCircle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference - arcLength}`}
        />
      </Svg>
    </Animated.View>
  );
}
