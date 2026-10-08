import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceFullViewStore } from "@/stores/workspace-full-view-store";
import {
  useWorkspaceLayoutStore,
  type SplitNode,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { resolveFullViewPaneId, toggleWorkspaceFullView } from "@/workspace-tabs/full-view";

const WORKSPACE_KEY = "server-1:workspace-1";
const OTHER_WORKSPACE_KEY = "server-1:workspace-2";

function pane(id: string, options: { hidden?: boolean } = {}): SplitNode {
  return {
    kind: "pane",
    pane: { id, tabIds: [], focusedTabId: null, ...(options.hidden ? { hidden: true } : {}) },
  };
}

function layoutOf(panes: SplitNode[], focusedPaneId = "main"): WorkspaceLayout {
  return {
    root: {
      kind: "group",
      group: {
        id: "root",
        direction: "horizontal",
        children: panes,
        sizes: panes.map(() => 1 / panes.length),
      },
    },
    focusedPaneId,
  };
}

function seedLayout(layout: WorkspaceLayout, sidePaneId: string | null = null): void {
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: { [WORKSPACE_KEY]: layout },
    explorerSidebarPaneIdByWorkspace: { [WORKSPACE_KEY]: "explorer" },
    sidePaneIdByWorkspace: sidePaneId ? { [WORKSPACE_KEY]: sidePaneId } : {},
  });
}

function fullViewPane(workspaceKey = WORKSPACE_KEY): string | undefined {
  return useWorkspaceFullViewStore.getState().fullViewPaneIdByWorkspace[workspaceKey];
}

beforeEach(() => {
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    explorerSidebarPaneIdByWorkspace: {},
    sidePaneIdByWorkspace: {},
  });
  useWorkspaceFullViewStore.setState({ fullViewPaneIdByWorkspace: {} });
});

describe("Full view store", () => {
  it("covers the canvas with a pane and restores it on the next toggle", () => {
    const { toggleFullView } = useWorkspaceFullViewStore.getState();

    toggleFullView(WORKSPACE_KEY, "side");
    expect(fullViewPane()).toBe("side");

    toggleFullView(WORKSPACE_KEY, "side");
    expect(fullViewPane()).toBeUndefined();
  });

  it("moves Full view to another pane without restoring the layout first", () => {
    const { toggleFullView } = useWorkspaceFullViewStore.getState();

    toggleFullView(WORKSPACE_KEY, "main");
    toggleFullView(WORKSPACE_KEY, "side");

    expect(fullViewPane()).toBe("side");
  });

  it("keeps each workspace's Full view apart", () => {
    const { toggleFullView, exitFullView } = useWorkspaceFullViewStore.getState();

    toggleFullView(WORKSPACE_KEY, "side");
    toggleFullView(OTHER_WORKSPACE_KEY, "right");
    exitFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBeUndefined();
    expect(fullViewPane(OTHER_WORKSPACE_KEY)).toBe("right");
  });
});

describe("resolveFullViewPaneId", () => {
  const explorerSidebarPaneId = "explorer";

  it("picks the remembered side pane over other splits", () => {
    const layout = layoutOf([pane("main"), pane("first-split"), pane("remembered")]);

    expect(
      resolveFullViewPaneId({ layout, explorerSidebarPaneId, rememberedSidePaneId: "remembered" }),
    ).toBe("remembered");
  });

  it("picks the first pane that is not main when no side pane was recorded", () => {
    const layout = layoutOf([pane("main"), pane("first-split"), pane("second-split")]);

    expect(
      resolveFullViewPaneId({ layout, explorerSidebarPaneId, rememberedSidePaneId: null }),
    ).toBe("first-split");
  });

  it("ignores a remembered pane that no longer exists", () => {
    const layout = layoutOf([pane("main"), pane("split")]);

    expect(
      resolveFullViewPaneId({ layout, explorerSidebarPaneId, rememberedSidePaneId: "gone" }),
    ).toBe("split");
  });

  it("has nothing to cover when main is the only ordinary pane", () => {
    const layout = layoutOf([pane("main"), pane("explorer")]);

    expect(
      resolveFullViewPaneId({ layout, explorerSidebarPaneId, rememberedSidePaneId: null }),
    ).toBeNull();
  });

  it("does not count the Explorer sidebar or hidden panes as something to cover", () => {
    const layout = layoutOf([
      pane("main"),
      pane("hidden-split", { hidden: true }),
      pane("explorer"),
    ]);

    expect(
      resolveFullViewPaneId({
        layout,
        explorerSidebarPaneId,
        rememberedSidePaneId: "hidden-split",
      }),
    ).toBeNull();
  });
});

describe("toggleWorkspaceFullView", () => {
  it("covers the canvas with the side pane and focuses it", () => {
    seedLayout(layoutOf([pane("main"), pane("side"), pane("explorer")]), "side");

    toggleWorkspaceFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBe("side");
    expect(useWorkspaceLayoutStore.getState().layoutByWorkspace[WORKSPACE_KEY]?.focusedPaneId).toBe(
      "side",
    );
  });

  it("restores the layout on the second press", () => {
    seedLayout(layoutOf([pane("main"), pane("side"), pane("explorer")]), "side");

    toggleWorkspaceFullView(WORKSPACE_KEY);
    toggleWorkspaceFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBeUndefined();
  });

  it("restores the layout when the toolbar put another pane in Full view", () => {
    seedLayout(layoutOf([pane("main"), pane("side"), pane("explorer")]), "side");
    useWorkspaceFullViewStore.getState().toggleFullView(WORKSPACE_KEY, "main");

    toggleWorkspaceFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBeUndefined();
  });

  it("covers the side pane even while another pane has focus", () => {
    seedLayout(
      layoutOf([pane("main"), pane("side"), pane("lower-split"), pane("explorer")], "lower-split"),
      "side",
    );

    toggleWorkspaceFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBe("side");
  });

  it("does nothing in a workspace with a single pane", () => {
    seedLayout(layoutOf([pane("main"), pane("explorer")]));

    toggleWorkspaceFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBeUndefined();
  });

  it("does nothing before the workspace has a layout", () => {
    toggleWorkspaceFullView(WORKSPACE_KEY);

    expect(fullViewPane()).toBeUndefined();
  });
});
