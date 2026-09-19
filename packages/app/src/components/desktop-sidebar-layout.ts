import { SETTINGS_DESKTOP_SPLIT_MIN_WIDTH } from "@/constants/layout";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/stores/panel-store";

const MIN_DESKTOP_CENTER_WIDTH = 400;

// Icon-only rail width (SB1). ChatGPT/Codex-style: brand mark, nav icons, footer
// identity/settings icons, each behind a tooltip. Workspace rows are hidden.
export const SIDEBAR_RAIL_WIDTH = 56;

export type DesktopSidebarMode = "expanded" | "rail" | "hidden";

export function resolveDesktopSidebarVisibility(input: {
  chromeEnabled: boolean;
  isCompactLayout: boolean;
  isMounted: boolean;
  isOpen: boolean;
  canShare: boolean;
}): boolean {
  return (
    input.chromeEnabled &&
    !input.isCompactLayout &&
    input.isMounted &&
    input.isOpen &&
    input.canShare
  );
}

/**
 * The sidebar's three-state machine (SB1). `visible` is the existing hidden/shown
 * decision (`resolveDesktopSidebarVisibility`) — the hide affordance (keyboard
 * shortcut, command center action, header hamburger) is untouched and still owns
 * that boolean, including its corner-obstruction consequences (docs/design.md §9).
 * `railPreferred` is the sidebar's own inline collapse toggle, independent of
 * visibility: collapsing to rail never hides the sidebar, and hiding then
 * reopening the sidebar restores whichever of expanded/rail was last chosen.
 */
export function resolveDesktopSidebarMode(input: {
  visible: boolean;
  railPreferred: boolean;
}): DesktopSidebarMode {
  if (!input.visible) {
    return "hidden";
  }
  return input.railPreferred ? "rail" : "expanded";
}

export function resolveDesktopAppChromeLayout(input: {
  desktopSidebarRendered: boolean;
  hasTopLeftWindowControls: boolean;
  sidebarControlsEnabled: boolean;
}) {
  const sidebarOwnsTopLeft = input.desktopSidebarRendered && input.hasTopLeftWindowControls;
  let sidebarToggleOwner: "none" | "window" | "content" = "none";
  if (input.sidebarControlsEnabled) {
    sidebarToggleOwner = input.hasTopLeftWindowControls ? "window" : "content";
  }
  return {
    sidebarCorners: sidebarOwnsTopLeft ? ("top-left" as const) : ("none" as const),
    contentCorners: sidebarOwnsTopLeft ? ("top-right" as const) : ("both" as const),
    sidebarToggleOwner,
  };
}

function resolveDesktopPanelWidth(input: {
  requestedWidth: number;
  viewportWidth: number;
  minimumWidth: number;
  maximumWidth: number;
}): number {
  "worklet";
  const maximumVisibleWidth = Math.max(
    input.minimumWidth,
    Math.min(input.maximumWidth, input.viewportWidth - MIN_DESKTOP_CENTER_WIDTH),
  );
  return Math.max(input.minimumWidth, Math.min(maximumVisibleWidth, input.requestedWidth));
}

export function resolveDesktopSidebarWidth(input: {
  requestedWidth: number;
  viewportWidth: number;
}): number {
  "worklet";
  return resolveDesktopPanelWidth({
    ...input,
    minimumWidth: MIN_SIDEBAR_WIDTH,
    maximumWidth: MAX_SIDEBAR_WIDTH,
  });
}

export function resolveDesktopAppContentMinimum(input: { isSettingsRoute: boolean }): number {
  return input.isSettingsRoute ? SETTINGS_DESKTOP_SPLIT_MIN_WIDTH : 0;
}

/** The pixel width the sidebar actually occupies in a given mode (M3). */
export function resolveDesktopSidebarEffectiveWidth(input: {
  mode: DesktopSidebarMode;
  requestedWidth: number;
  viewportWidth: number;
}): number {
  if (input.mode === "hidden") {
    return 0;
  }
  if (input.mode === "rail") {
    return SIDEBAR_RAIL_WIDTH;
  }
  return resolveDesktopSidebarWidth({
    requestedWidth: input.requestedWidth,
    viewportWidth: input.viewportWidth,
  });
}

export function canDesktopAppSidebarShare(input: {
  contentMinimumWidth: number;
  requestedSidebarWidth: number;
  viewportWidth: number;
}): boolean {
  return (
    input.viewportWidth -
      resolveDesktopSidebarWidth({
        requestedWidth: input.requestedSidebarWidth,
        viewportWidth: input.viewportWidth,
      }) >=
    input.contentMinimumWidth
  );
}
