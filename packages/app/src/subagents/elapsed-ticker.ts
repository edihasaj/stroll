/**
 * The shared clock behind live subagent elapsed-time labels.
 *
 * A fan-out can show many running rows at once, in the track and in the transcript. The naive
 * version — one `setInterval` per row — turns that into dozens of 1 Hz timers, which is exactly
 * the kind of idle CPU cost this app has been burned by before. Instead there is at most one
 * shared 1 Hz timer, running only while at least one row is actually subscribed; a row that is
 * not running, or whose panel is not visible, never subscribes and so never ticks.
 */
const listeners = new Set<() => void>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function notify(): void {
  // Iterated live rather than copied: see relative-time-ticker.ts — a listener that unsubscribes
  // on its own tick must not be skipped over incorrectly, and Set iteration tolerates deletion.
  for (const listener of listeners) {
    listener();
  }
}

function start(): void {
  if (intervalHandle !== null) return;
  intervalHandle = setInterval(notify, 1000);
}

function stop(): void {
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

/** Subscribes to the shared 1 Hz tick. The timer runs only while at least one listener holds it. */
export function subscribeToElapsedTick(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Test seam: whether the shared timer is currently running. */
export function isElapsedTickerRunning(): boolean {
  return intervalHandle !== null;
}
