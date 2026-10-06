import { useCallback, useLayoutEffect, useRef, type RefCallback } from "react";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import type { View as NativeView } from "react-native";
import { STATUS_RING_PERIOD_MS } from "@/components/status-ring/geometry";

const STATUS_RING_KEYFRAMES: PropertyIndexedKeyframes = {
  transform: ["rotate(0deg)", "rotate(360deg)"],
};
const STATUS_RING_TIMING: KeyframeAnimationOptions = {
  duration: STATUS_RING_PERIOD_MS,
  easing: "linear",
  iterations: Number.POSITIVE_INFINITY,
};
const STATUS_RING_TIMELINE_START_MS = 0;

export function useStatusRingAnimationRef(): RefCallback<NativeView> {
  const arcElement = useRef<HTMLElement | null>(null);
  const animationRef = useRef<Animation | null>(null);
  // A running ring keeps the browser producing a frame for the whole window 60 times a second
  // (about a tenth of a core on its own), so rings hold still while the window is in the
  // background — docs/design.md "Continuous loops on web".
  const windowActive = useAppActivelyVisible();
  const setArcElement = useCallback((instance: NativeView | null) => {
    arcElement.current = instance instanceof HTMLElement ? instance : null;
  }, []);

  useLayoutEffect(() => {
    const element = arcElement.current;
    if (!element) {
      return;
    }

    const animation = element.animate(STATUS_RING_KEYFRAMES, STATUS_RING_TIMING);
    animation.startTime = STATUS_RING_TIMELINE_START_MS;
    animationRef.current = animation;
    return () => {
      animation.cancel();
      animationRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const animation = animationRef.current;
    if (!animation) return;
    if (!windowActive) {
      animation.pause();
      return;
    }
    if (animation.playState === "paused") {
      animation.play();
      // play() resumes from the paused time; re-pin the epoch so every ring is in phase again.
      animation.startTime = STATUS_RING_TIMELINE_START_MS;
    }
  }, [windowActive]);

  return setArcElement;
}
