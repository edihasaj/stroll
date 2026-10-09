import { beforeEach, describe, expect, it, vi } from "vitest";

const layoutMock = vi.hoisted(() => ({ compact: false }));

vi.mock("@/constants/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/constants/layout")>()),
  getIsCompactFormFactor: () => layoutMock.compact,
}));

import { DEFAULT_OPEN_IN_SIDE_PANE_PREFERENCES } from "@/hooks/use-settings/storage";
import {
  collectAllPanes,
  collectAllTabs,
  DEFAULT_PANE_ID,
  findPaneContainingTab,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import {
  openPreferredWorkspaceTarget,
  resolvePreferredSidePanePlacement,
} from "@/workspace-tabs/open-beside";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

const WORKSPACE_KEY = "server-1:workspace-1";
const BROWSER_TARGET: WorkspaceTabTarget = { kind: "browser", browserId: "browser-1" };
const BROWSER_BESIDE = { ...DEFAULT_OPEN_IN_SIDE_PANE_PREFERENCES, browser: true };
const BROWSER_IN_MAIN = { ...DEFAULT_OPEN_IN_SIDE_PANE_PREFERENCES, browser: false };

function paneHoldingBrowser(): string | null {
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY];
  if (!layout) return null;
  const tab = collectAllTabs(layout.root).find((candidate) => candidate.target.kind === "browser");
  return tab ? (findPaneContainingTab(layout.root, tab.tabId)?.id ?? null) : null;
}

function ordinaryPaneIds(): string[] {
  const state = useWorkspaceLayoutStore.getState();
  const layout = state.layoutByWorkspace[WORKSPACE_KEY];
  if (!layout) return [];
  const explorerPaneId = state.explorerSidebarPaneIdByWorkspace[WORKSPACE_KEY];
  return collectAllPanes(layout.root)
    .map((pane) => pane.id)
    .filter((paneId) => paneId !== explorerPaneId);
}

beforeEach(() => {
  layoutMock.compact = false;
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    explorerSidebarPaneIdByWorkspace: {},
    sidePaneIdByWorkspace: {},
    splitSizesByWorkspace: {},
  });
});

describe("browser opens beside the chat", () => {
  it("opens a browser tab in the side pane when the preference is on", () => {
    openPreferredWorkspaceTarget({
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
      target: BROWSER_TARGET,
      source: "browser",
      preferences: BROWSER_BESIDE,
    });

    const sidePaneId = useWorkspaceLayoutStore.getState().sidePaneIdByWorkspace[WORKSPACE_KEY];
    expect(sidePaneId).toBeTruthy();
    expect(sidePaneId).not.toBe(DEFAULT_PANE_ID);
    expect(paneHoldingBrowser()).toBe(sidePaneId);
  });

  it("reuses the side pane for the next browser tab", () => {
    for (const browserId of ["browser-1", "browser-2"]) {
      openPreferredWorkspaceTarget({
        isCompact: false,
        workspaceKey: WORKSPACE_KEY,
        target: { kind: "browser", browserId },
        source: "browser",
        preferences: BROWSER_BESIDE,
      });
    }

    expect(ordinaryPaneIds()).toHaveLength(2);
  });

  it("opens a browser tab in the side pane even when the preference is off", () => {
    openPreferredWorkspaceTarget({
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
      target: BROWSER_TARGET,
      source: "browser",
      preferences: BROWSER_IN_MAIN,
    });

    const sidePaneId = useWorkspaceLayoutStore.getState().sidePaneIdByWorkspace[WORKSPACE_KEY];
    expect(sidePaneId).toBeTruthy();
    expect(paneHoldingBrowser()).toBe(sidePaneId);
  });

  it("never opens a side pane on a compact layout", () => {
    layoutMock.compact = true;
    openPreferredWorkspaceTarget({
      isCompact: true,
      workspaceKey: WORKSPACE_KEY,
      target: BROWSER_TARGET,
      source: "browser",
      preferences: BROWSER_BESIDE,
    });

    expect(paneHoldingBrowser()).toBe(DEFAULT_PANE_ID);
    expect(ordinaryPaneIds()).toEqual([DEFAULT_PANE_ID]);
    expect(useWorkspaceLayoutStore.getState().sidePaneIdByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });
});

describe("resolvePreferredSidePanePlacement", () => {
  const input = {
    workspaceKey: WORKSPACE_KEY,
    isCompact: false,
    source: "browser",
    preferences: BROWSER_BESIDE,
  } as const;

  it("returns the side pane and creates it on first use", () => {
    const placement = resolvePreferredSidePanePlacement(input);

    const sidePaneId = useWorkspaceLayoutStore.getState().sidePaneIdByWorkspace[WORKSPACE_KEY];
    expect(placement).toEqual({ mode: "prefer", paneId: sidePaneId });
  });

  it("returns the side pane even when the preference is off", () => {
    const placement = resolvePreferredSidePanePlacement({
      ...input,
      preferences: BROWSER_IN_MAIN,
    });

    const sidePaneId = useWorkspaceLayoutStore.getState().sidePaneIdByWorkspace[WORKSPACE_KEY];
    expect(placement).toEqual({ mode: "prefer", paneId: sidePaneId });
  });

  it("leaves the layout alone on a compact layout", () => {
    layoutMock.compact = true;
    const placement = resolvePreferredSidePanePlacement({ ...input, isCompact: true });

    expect(placement).toBeUndefined();
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY]).toBeUndefined();
  });

  it("moves focus into a new side pane for a foreground open", () => {
    const placement = resolvePreferredSidePanePlacement(input);

    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY];
    expect(placement?.mode).toBe("prefer");
    expect(layout?.focusedPaneId).not.toBe(DEFAULT_PANE_ID);
  });

  it("keeps focus where it was for a background open", () => {
    openPreferredWorkspaceTarget({
      isCompact: false,
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "draft", draftId: "draft-1" },
      source: "browser",
      preferences: BROWSER_IN_MAIN,
    });
    const focusedBefore =
      useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY]?.focusedPaneId;

    const placement = resolvePreferredSidePanePlacement({ ...input, background: true });

    const sidePaneId = useWorkspaceLayoutStore.getState().sidePaneIdByWorkspace[WORKSPACE_KEY];
    expect(placement).toEqual({ mode: "prefer", paneId: sidePaneId });
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY]?.focusedPaneId).toBe(
      focusedBefore,
    );
  });
});
