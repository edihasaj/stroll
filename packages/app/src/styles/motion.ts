import { FadeIn, FadeOut, Keyframe } from "react-native-reanimated";
import { isWeb } from "@/constants/platform";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
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
 *
 * That recipe is native-only for `entering` on an in-flow element whose size can change (a
 * streaming message, a loading list) — see `webAppearStyle` below and docs/design.md "17.
 * Motion" for why, and swap the `entering` prop for a `webAppearStyle` CSS animation on web.
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

/**
 * Reanimated layout animations (`entering`/`exiting`) are native-only. On web, Reanimated's
 * layout-animation runtime takes the animated element out of normal flow (`position: absolute`,
 * a size snapshot taken at mount) for the duration of the animation, then hands it back to
 * static flow once the animation's own bookkeeping decides it finished. That is invisible for a
 * surface whose size is fixed before the animation starts — the menu/popover `openClose*` shapes,
 * or a child inside a hard-sized parent like the composer's 32px send-button circle. It breaks
 * for an **in-flow element whose size can change**: a streaming message that mounts near-empty
 * and grows, or a list that loads content after the entrance starts. The snapshot goes stale, the
 * parent collapses to the snapshot's height instead of the live content height, and whatever
 * renders after it in flow (a turn footer, a sidebar footer) draws on top of it. This shipped
 * once already for the M1 message entrance (`packages/app/src/components/message.tsx`) and again
 * for the sidebar's rail-mode workspace list (`packages/app/src/components/left-sidebar.tsx`).
 *
 * The fix is not a bigger Reanimated workaround — it is not using Reanimated's layout-animation
 * runtime on web for these elements at all. `webAppearStyle` returns a plain style object driving
 * a CSS `@keyframes` animation on `opacity`/`transform` only, which never touches `position` or
 * `height`, so the wrapper never leaves flow and is always sized to its live content. Native
 * callers keep `entering={appearEntering}` (or `messageEntranceEntering`-style variants); web
 * callers drop `entering` entirely and merge this style onto the same in-flow wrapper instead:
 *
 *   const reducedMotion = useAppReducedMotion();
 *   <Animated.View
 *     entering={isWeb ? undefined : withMotion(reducedMotion, appearEntering)}
 *     style={[containerStyle, webAppearStyle(reducedMotion)]}
 *   />
 *
 * Returns `undefined` on native (use the Reanimated `entering` prop there) and when
 * `reducedMotion` is on (matches `withMotion`'s reduced-motion behavior for the native path).
 * `exiting` is not part of this helper: an element leaving the tree does not have the "keeps
 * growing while off-flow" hazard above, and `FloatingSurface` (`components/ui/floating.tsx`)
 * already owns the one case (simultaneous ancestor+descendant unmount) where web `exiting` itself
 * is unsafe.
 */
export function webAppearStyle(
  reducedMotion: boolean,
  options?: { riseBy?: number },
): object | undefined {
  if (!isWeb || reducedMotion) return undefined;
  const riseBy = options?.riseBy ?? 0;
  const animationName =
    riseBy > 0 ? ensureWebAppearRiseKeyframe(riseBy) : ensureWebAppearKeyframe();
  return inlineUnistylesStyle({
    animationName,
    animationDuration: `${MOTION_DURATION.slow}ms`,
    // Keyframe steps elsewhere in this module carry no per-property easing, so Reanimated
    // applies its documented default (linear) between them — see the comment above
    // `openCloseEntering`. Match that here so the web and native curves agree.
    animationTimingFunction: "linear",
    animationFillMode: "both",
  });
}

const WEB_APPEAR_ANIMATION_NAME = "paseo-motion-appear";

// Ids of `<style>` tags already confirmed present in `document.head`, so repeated calls (every
// render of every entrance across the app) don't re-touch the DOM once a keyframe is registered.
const registeredWebKeyframeIds = new Set<string>();

function ensureWebAppearKeyframe(): string {
  ensureWebKeyframeStyleTag(
    `${WEB_APPEAR_ANIMATION_NAME}-keyframes`,
    `@keyframes ${WEB_APPEAR_ANIMATION_NAME} { from { opacity: 0; } to { opacity: 1; } }`,
  );
  return WEB_APPEAR_ANIMATION_NAME;
}

// Keyed by rise distance so a caller that ever needs a different translateY than the message
// entrance's 8px still gets a correctly named, independently cached keyframe.
function ensureWebAppearRiseKeyframe(riseBy: number): string {
  const animationName = `${WEB_APPEAR_ANIMATION_NAME}-rise-${riseBy}`;
  ensureWebKeyframeStyleTag(
    `${animationName}-keyframes`,
    `@keyframes ${animationName} { from { opacity: 0; transform: translateY(${riseBy}px); } to { opacity: 1; transform: translateY(0); } }`,
  );
  return animationName;
}

/**
 * Idempotently injects a `<style>` tag holding one `@keyframes` block. Shared by the two
 * `webAppearStyle` variants above; follow this same shape for a future web keyframe rather than
 * hand-rolling another injector (see `message.tsx`'s `ensureWebToolCallShimmerKeyframes` for the
 * precedent this generalizes).
 */
function ensureWebKeyframeStyleTag(id: string, css: string): void {
  if (!isWeb || typeof document === "undefined") return;
  if (registeredWebKeyframeIds.has(id)) return;
  if (document.getElementById(id)) {
    registeredWebKeyframeIds.add(id);
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.id = id;
  styleElement.textContent = css;
  document.head.appendChild(styleElement);
  registeredWebKeyframeIds.add(id);
}
