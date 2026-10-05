import React, { useEffect } from "react";
import { View, type ActivityIndicatorProps } from "react-native";
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
import { isWeb } from "@/constants/platform";
import { useAppReducedMotion } from "@/hooks/use-app-reduced-motion";
import { webSpinStyle } from "@/styles/motion";
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

interface SpinnerRingProps {
  color: string;
  diameter: number;
}

function SpinnerRing({ color, diameter }: SpinnerRingProps) {
  const strokeWidth = diameter <= THIN_DIAMETER_CEILING ? THIN_STROKE_WIDTH : STROKE_WIDTH;
  const radius = (diameter - strokeWidth) / 2;
  const center = diameter / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * ARC_FRACTION;
  return (
    <Svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}>
      <ThemedTrackCircle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} />
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
  );
}

interface SpinnerShellProps extends SpinnerRingProps {
  style?: ActivityIndicatorProps["style"];
}

// Web: a compositor-run CSS rotation (see `webSpinStyle`). A Reanimated loop here would cost a
// main-thread frame callback per mounted spinner, which is what made an idle window burn CPU.
function WebSpinner({ color, diameter, style }: SpinnerShellProps) {
  const reduceMotion = useAppReducedMotion();
  return (
    <View
      style={[
        { width: diameter, height: diameter },
        webSpinStyle(reduceMotion, ROTATION_DURATION_MS),
        style,
      ]}
      accessible
      accessibilityRole="progressbar"
    >
      <SpinnerRing color={color} diameter={diameter} />
    </View>
  );
}

// Native: Reanimated already drives this on the UI thread, off the JS thread.
function NativeSpinner({ color, diameter, style }: SpinnerShellProps) {
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
      <SpinnerRing color={color} diameter={diameter} />
    </Animated.View>
  );
}

/**
 * A thin rotating arc over a full track ring — the Codex/OpenClaw loading
 * mark. `color` is the arc; the track is always `theme.colors.border`.
 */
export function LoadingSpinner({ color, size = "small", style }: LoadingSpinnerProps) {
  const diameter = resolveDiameter(size);
  const Shell = isWeb ? WebSpinner : NativeSpinner;
  return <Shell color={color} diameter={diameter} style={style} />;
}
