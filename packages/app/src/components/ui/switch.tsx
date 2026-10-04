import { useCallback, useMemo } from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { createControlGeometry, switchGeometry } from "@/components/ui/control-geometry";
import { useAppReducedMotion } from "@/hooks/use-app-reduced-motion";
import { MOTION_DURATION, type Theme } from "@/styles/theme";

interface SwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const EASING = Easing.inOut(Easing.ease);

interface SwitchTrackProps {
  value: boolean;
  duration: number;
  trackOffColor: string;
  trackOnColor: string;
  // "transparent" in dark — only light draws a hairline on the off track (docs/design.md
  // "Finish"), since the on-track's accent fill never needs one.
  trackBorderOffColor: string;
  thumbOffColor: string;
  thumbOnColor: string;
}

function SwitchTrack({
  value,
  duration,
  trackOffColor,
  trackOnColor,
  trackBorderOffColor,
  thumbOffColor,
  thumbOnColor,
}: SwitchTrackProps) {
  const timing = useMemo(() => ({ duration, easing: EASING }), [duration]);
  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, timing));

  const trackAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [trackOffColor, trackOnColor]),
    borderColor: interpolateColor(progress.value, [0, 1], [trackBorderOffColor, "transparent"]),
  }));

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [thumbOffColor, thumbOnColor]),
    transform: [{ translateX: progress.value * switchGeometry.thumbTravel }],
  }));

  const trackStyle = useMemo(() => [styles.switchTrack, trackAnimatedStyle], [trackAnimatedStyle]);
  const thumbStyle = useMemo(
    () => [styles.switchThumb, styles.thumb, thumbAnimatedStyle],
    [thumbAnimatedStyle],
  );

  return (
    <Animated.View style={trackStyle}>
      <Animated.View style={thumbStyle} />
    </Animated.View>
  );
}

const ThemedSwitchTrack = withUnistyles(SwitchTrack, (theme: Theme) => ({
  trackOffColor: theme.colors.surface3,
  trackOnColor: theme.colors.accent,
  trackBorderOffColor: theme.colorScheme === "light" ? theme.colors.border : "transparent",
  thumbOffColor: theme.colors.palette.white,
  thumbOnColor: theme.colors.accentForeground,
}));

export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: SwitchProps) {
  const reducedMotion = useAppReducedMotion();
  const duration = reducedMotion ? 0 : MOTION_DURATION.base;
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (disabled) return;
      onValueChange?.(!value);
    },
    [disabled, onValueChange, value],
  );

  const accessibilityState = useMemo(() => ({ checked: value, disabled }), [value, disabled]);
  const pressableStyle = useMemo(
    () => [styles.switchControl, disabled ? styles.disabled : null, style],
    [disabled, style],
  );

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      aria-checked={value}
      testID={testID}
      style={pressableStyle}
    >
      <ThemedSwitchTrack value={value} duration={duration} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const geometry = createControlGeometry(theme);
  const trackBorderWidth = theme.borderWidth[1];

  return {
    switchControl: {
      ...geometry.switchControl,
    },
    switchTrack: {
      width: switchGeometry.trackWidth,
      height: switchGeometry.trackHeight,
      borderRadius: switchGeometry.trackHeight / 2,
      // Border width eats into the box the same way on every theme (only its colour animates
      // to transparent on dark/on-state), so `thumbTravel`'s shared math never drifts between
      // themes — see docs/design.md "Finish".
      borderWidth: trackBorderWidth,
      padding: (switchGeometry.trackHeight - switchGeometry.thumbSize) / 2 - trackBorderWidth,
      justifyContent: "center",
    },
    switchThumb: {
      width: switchGeometry.thumbSize,
      height: switchGeometry.thumbSize,
      borderRadius: switchGeometry.thumbSize / 2,
    },
    thumb: {
      boxShadow: theme.shadow.xs,
    },
    disabled: {
      opacity: theme.opacity[50],
    },
  };
});
