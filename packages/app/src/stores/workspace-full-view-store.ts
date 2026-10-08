import { create } from "zustand";

interface WorkspaceFullViewState {
  /**
   * The pane covering the workspace canvas, per workspace. Not persisted: a restart shows the
   * layout as saved, so the persisted workspace layout schema never learns about it.
   */
  fullViewPaneIdByWorkspace: Record<string, string>;
  /** Covers the canvas with the pane, or restores the layout when it already covers it. */
  toggleFullView: (workspaceKey: string, paneId: string) => void;
  exitFullView: (workspaceKey: string) => void;
}

export const useWorkspaceFullViewStore = create<WorkspaceFullViewState>()((set) => ({
  fullViewPaneIdByWorkspace: {},
  toggleFullView: (workspaceKey, paneId) =>
    set((state) => {
      const { [workspaceKey]: current, ...others } = state.fullViewPaneIdByWorkspace;
      return {
        fullViewPaneIdByWorkspace:
          current === paneId ? others : { ...others, [workspaceKey]: paneId },
      };
    }),
  exitFullView: (workspaceKey) =>
    set((state) => {
      if (!(workspaceKey in state.fullViewPaneIdByWorkspace)) return state;
      const { [workspaceKey]: _exited, ...others } = state.fullViewPaneIdByWorkspace;
      return { fullViewPaneIdByWorkspace: others };
    }),
}));
