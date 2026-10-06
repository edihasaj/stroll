import { useEffect, useState } from "react";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { formatDuration } from "@/utils/time";
import { subscribeToElapsedTick } from "./elapsed-ticker";

export interface ElapsedTimeWindow {
  /** When the row started running. `null` when timing is unknown — nothing is shown. */
  startedAt: Date | null;
  /** True while elapsed time should keep ticking; false once the row has finished. */
  isRunning: boolean;
  /** When the row finished, for a frozen final duration. Ignored while `isRunning`. */
  endedAt?: Date | null;
}

/**
 * A compact elapsed-time label ("47s", "2m 12s") that keeps itself current while running and
 * freezes at the final duration once finished.
 *
 * Subscribes to the shared 1 Hz ticker (`elapsed-ticker.ts`) only while `isRunning` is true and
 * the app itself is actively visible — a finished row never ticks, and a running row stops
 * ticking while the window or tab is backgrounded. The displayed value is always computed fresh
 * from `Date.now()` at render time, so resubscribing after the app regains focus repaints the
 * current elapsed time immediately rather than resuming from a stale count.
 */
export function useElapsedLabel(window: ElapsedTimeWindow): string {
  const { startedAt, isRunning, endedAt } = window;
  const appActivelyVisible = useAppActivelyVisible();
  const startedAtMs = startedAt ? startedAt.getTime() : null;
  const endedAtMs = endedAt ? endedAt.getTime() : null;
  const shouldTick = isRunning && startedAtMs !== null && appActivelyVisible;

  const [, setTickCount] = useState(0);
  useEffect(() => {
    if (!shouldTick) return undefined;
    return subscribeToElapsedTick(() => setTickCount((count) => count + 1));
  }, [shouldTick]);

  if (startedAtMs === null) {
    return "";
  }
  if (isRunning) {
    return formatDuration(Math.max(0, Date.now() - startedAtMs));
  }
  if (endedAtMs !== null) {
    return formatDuration(Math.max(0, endedAtMs - startedAtMs));
  }
  return "";
}
