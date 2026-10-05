import { SETTINGS_DESKTOP_SPLIT_MIN_WIDTH } from "@/constants/layout";
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/stores/panel-store";

const MIN_DESKTOP_CENTER_WIDTH = 400;

// Icon-only rail width (SB2, Codex-parity). Chats/Projects/Schedules/plugin icons, a `•••`
// overflow, and Settings, each behind a tooltip. In "rail" mode this is the whole sidebar; in
// "expanded" mode it is a fixed sibling column beside the resizable panel (SidebarPanel).
export const SIDEBAR_RAIL_WIDTH = 52;

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

/**
 * The pixel width the sidebar actually occupies in a given mode (M3). `requestedWidth` is the
 * panel's own width (SB2) — in "expanded" mode the rail is a fixed sibling column added on top
 * of it, not part of the clamped request.
 */
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
  return (
    SIDEBAR_RAIL_WIDTH +
    resolveDesktopSidebarWidth({
      requestedWidth: input.requestedWidth,
      viewportWidth: input.viewportWidth,
    })
  );
}

export function canDesktopAppSidebarShare(input: {
  contentMinimumWidth: number;
  /** "hidden" never reaches here — the caller only asks this to decide whether a visible
   * sidebar would fit, so it is always choosing between the rail and the expanded panel. */
  mode: "rail" | "expanded";
  requestedPanelWidth: number;
  viewportWidth: number;
}): boolean {
  return (
    input.viewportWidth -
      resolveDesktopSidebarEffectiveWidth({
        mode: input.mode,
        requestedWidth: input.requestedPanelWidth,
        viewportWidth: input.viewportWidth,
      }) >=
    input.contentMinimumWidth
  );
}
