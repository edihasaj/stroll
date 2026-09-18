import { useReducedMotion } from "react-native-reanimated";

/**
 * The app's single reduced-motion seam. Every `entering`/`exiting`/`withTiming` call site reads
 * this instead of calling Reanimated's `useReducedMotion()` directly, so there is one place to
 * change if the check ever needs to layer an in-app "reduce motion" setting on top of the OS
 * preference.
 *
 * Pair with `withMotion` so call sites stay one-liners:
 *
 *   const reducedMotion = useAppReducedMotion();
 *   <Animated.View
 *     entering={withMotion(reducedMotion, appearEntering)}
 *     exiting={withMotion(reducedMotion, appearExiting)}
 *   />
 */
export function useAppReducedMotion(): boolean {
  return useReducedMotion();
}

/**
 * Returns `undefined` when reduced motion is on, otherwise `animation` unchanged. Use it to gate
 * any Reanimated `entering`/`exiting`/`layout` prop (or a plain boolean-driven animation branch)
 * without repeating a ternary at every call site.
 */
export function withMotion<T>(reducedMotion: boolean, animation: T): T | undefined {
  return reducedMotion ? undefined : animation;
}
