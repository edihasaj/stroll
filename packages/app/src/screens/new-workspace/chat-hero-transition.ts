import { MOTION_DURATION } from "@/styles/theme";

/**
 * Resolves once the blank-chat hero's exit animation has had time to play, or immediately when
 * reduced motion is on. `handleSubmitNewWorkspace` (`new-workspace-screen.tsx`) awaits this
 * before letting the already-in-flight workspace navigation fire, so the fade-out is not cut
 * short by an unmount racing the daemon's creation event. It never gates the creation request
 * itself — that request is sent beforehand, independent of this promise.
 */
export function waitForChatHeroExit(reducedMotion: boolean): Promise<void> {
  if (reducedMotion) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, MOTION_DURATION.slow));
}
