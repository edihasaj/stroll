import { FadeIn, FadeOut, Keyframe } from "react-native-reanimated";
import { MOTION_DURATION } from "@/styles/theme";

/**
 * Two motion shapes cover every animated site in the app (docs/design.md "Motion",
 * docs/ui-gap-gpt.md's "Motion system" proposal). New motion is one of these, not a third:
 *
 * - `openClose*` — an anchored surface opening/closing in place: menus, popovers, comboboxes,
 *   tooltips, hover cards. Scale 0.97 -> 1 + opacity. Reference: the menu overlay
 *   (`packages/app/src/components/ui/menu/menu-overlay.tsx`).
 * - `appear*` — a surface fading in/out with no scale change: the scroll-to-bottom pill,
 *   message entrances. Reference: `packages/app/src/agent-stream/view.tsx`.
 *
 * These are plain Reanimated builders, not hooks. Gate them at the call site with
 * `useAppReducedMotion()` + `withMotion()` (`@/hooks/use-app-reduced-motion`):
 *
 *   const reducedMotion = useAppReducedMotion();
 *   <Animated.View
 *     entering={withMotion(reducedMotion, appearEntering)}
 *     exiting={withMotion(reducedMotion, appearExiting)}
 *   />
 */
// Keyframe steps below carry no per-property `easing`, so Reanimated applies its documented
// default (`Easing.linear`) between them — the same implicit curve `menu-overlay.tsx` already
// shipped. `theme.motion.easing.standard` (`@/styles/theme`) names that curve for callers that
// use a timing function accepting an explicit easing (e.g. `withTiming`); `Keyframe` has no
// chainable `.easing()`, so it is not threaded through here.
export const openCloseEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.97 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(MOTION_DURATION.base);

export const openCloseExiting = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.97 }] },
}).duration(MOTION_DURATION.fast);

export const appearEntering = FadeIn.duration(MOTION_DURATION.slow);
export const appearExiting = FadeOut.duration(MOTION_DURATION.slow);
