import {
  collectAllPanes,
  DEFAULT_PANE_ID,
  resolveExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { useWorkspaceFullViewStore } from "@/stores/workspace-full-view-store";

interface ResolveFullViewPaneInput {
  layout: WorkspaceLayout;
  explorerSidebarPaneId: string | null;
  rememberedSidePaneId: string | null;
}

/**
 * The pane Full view covers the canvas with: the side pane, the one `ensureSidePane` would reuse.
 * Null when the workspace has a single visible pane, because there is nothing to cover. Two visible
 * panes always include a non-main one, so the focused pane never has to stand in for the side pane.
 */
export function resolveFullViewPaneId(input: ResolveFullViewPaneInput): string | null {
  const visiblePanes = collectAllPanes(input.layout.root).filter(
    (pane) => pane.id !== input.explorerSidebarPaneId && pane.hidden !== true,
  );
  if (visiblePanes.length < 2) return null;
  const remembered = visiblePanes.find((pane) => pane.id === input.rememberedSidePaneId);
  const sidePane = remembered ?? visiblePanes.find((pane) => pane.id !== DEFAULT_PANE_ID);
  return sidePane?.id ?? null;
}

/**
 * Shortcut and Command Center entry for Full view: covers the canvas with the side pane and focuses
 * it, or restores the layout when something already covers it. A single pane has nothing to cover.
 */
export function toggleWorkspaceFullView(workspaceKey: string): void {
  const fullView = useWorkspaceFullViewStore.getState();
  if (fullView.fullViewPaneIdByWorkspace[workspaceKey]) {
    fullView.exitFullView(workspaceKey);
    return;
  }
  const layoutState = useWorkspaceLayoutStore.getState();
  const layout = layoutState.layoutByWorkspace[workspaceKey];
  if (!layout) return;
  const paneId = resolveFullViewPaneId({
    layout,
    explorerSidebarPaneId: resolveExplorerSidebarPaneId(
      layout,
      layoutState.explorerSidebarPaneIdByWorkspace[workspaceKey],
    ),
    rememberedSidePaneId: layoutState.sidePaneIdByWorkspace[workspaceKey] ?? null,
  });
  if (!paneId) return;
  layoutState.focusPane(workspaceKey, paneId);
  fullView.toggleFullView(workspaceKey, paneId);
}
