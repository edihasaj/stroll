/**
 * Pure timing rules for `<Tooltip>`'s hover-open delay (docs/ui-gap-gpt.md B1).
 *
 * Kept free of React/Reanimated so the delay and grace-window logic can be unit-tested without
 * mounting a component or mocking a platform.
 */

/** Default hover delay before a tooltip opens, unless a caller passes its own `delayDuration`. */
export const TOOLTIP_OPEN_DELAY_MS = 400;

/**
 * How long after a tooltip closes a fresh hover elsewhere still counts as "still browsing this
 * toolbar" and skips the delay — the macOS/ChatGPT behavior of moving between adjacent tooltip
 * triggers without re-waiting for each one.
 */
export const TOOLTIP_REOPEN_GRACE_MS = 300;

/**
 * Resolves how long a hover should wait before opening its tooltip.
 *
 * Returns `0` (open immediately) when `lastCloseAt` is inside the grace window of `now`;
 * otherwise returns the caller's requested delay, floored at `0`.
 */
export function resolveTooltipOpenDelayMs(params: {
  requestedDelayMs: number;
  now: number;
  lastCloseAt: number | null;
  graceMs?: number;
}): number {
  const { requestedDelayMs, now, lastCloseAt, graceMs = TOOLTIP_REOPEN_GRACE_MS } = params;
  if (lastCloseAt != null && now - lastCloseAt <= graceMs) {
    return 0;
  }
  return Math.max(0, requestedDelayMs);
}
