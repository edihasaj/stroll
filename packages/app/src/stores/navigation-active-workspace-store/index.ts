import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, usePathname } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import {
  createLastWorkspaceSelectionStore,
  LAST_WORKSPACE_SELECTION_STORAGE_KEY,
  type ActiveWorkspaceSelection,
  type LastWorkspaceSelectionStorage,
} from "@/stores/last-workspace-selection";
import {
  navigateToLastWorkspace as navigateToLastWorkspacePure,
  navigateToWorkspace as navigateToWorkspacePure,
  parseActiveWorkspaceSelection,
  type NavigateToWorkspaceDeps,
  type NavigateToWorkspaceInput,
} from "./navigation";
import { useSessionStore } from "@/stores/session-store";
import {
  resolveExplorerSidebarPaneId,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { getIsCompactFormFactor } from "@/constants/layout";
import {
  isSingleChatMainActive,
  mainPaneHasChat,
  resolveMainPane,
} from "@/workspace-tabs/single-chat";
import { stripHostWorkspaceRouteEchoSearchFromBrowserUrlAfterCommit } from "@/utils/host-route-browser";
import { navigateToHostWorkspaceRoute } from "@/navigation/workspace-route-navigation";

export type { ActiveWorkspaceSelection } from "@/stores/last-workspace-selection";
export type { NavigateToWorkspaceInput } from "./navigation";

const lastWorkspaceSelectionStorage: LastWorkspaceSelectionStorage = {
  read: () => AsyncStorage.getItem(LAST_WORKSPACE_SELECTION_STORAGE_KEY),
  write: (value) => AsyncStorage.setItem(LAST_WORKSPACE_SELECTION_STORAGE_KEY, value),
  clear: () => AsyncStorage.removeItem(LAST_WORKSPACE_SELECTION_STORAGE_KEY),
};

const lastWorkspaceSelectionStore = createLastWorkspaceSelectionStore(
  lastWorkspaceSelectionStorage,
);

function mainViewShowsChat(workspaceKey: string): boolean {
  if (!isSingleChatMainActive({ isCompact: getIsCompactFormFactor() })) {
    return false;
  }
  const state = useWorkspaceLayoutStore.getState();
  const layout = state.layoutByWorkspace[workspaceKey];
  if (!layout) {
    return false;
  }
  const explorerPaneId = resolveExplorerSidebarPaneId(
    layout,
    state.explorerSidebarPaneIdByWorkspace[workspaceKey],
  );
  return mainPaneHasChat(layout.root, explorerPaneId);
}

function focusMainPaneIfUnfocused(workspaceKey: string): void {
  const state = useWorkspaceLayoutStore.getState();
  const layout = state.layoutByWorkspace[workspaceKey];
  if (!layout || layout.focusedPaneId !== null) {
    return;
  }
  const explorerPaneId = resolveExplorerSidebarPaneId(
    layout,
    state.explorerSidebarPaneIdByWorkspace[workspaceKey],
  );
  const mainPane = resolveMainPane(layout.root, explorerPaneId);
  if (mainPane) {
    state.focusPane(workspaceKey, mainPane.id);
  }
}

function navigateDeps(): NavigateToWorkspaceDeps {
  return {
    getSessionWorkspaces: (serverId) => useSessionStore.getState().sessions[serverId]?.workspaces,
    getSessionAgents: (serverId) =>
      useSessionStore.getState().sessions[serverId]?.agents.values() ?? [],
    isWorkspaceLayoutHydrated: () => useWorkspaceLayoutStore.persist.hasHydrated(),
    mainViewShowsChat,
    focusMainPaneIfUnfocused,
    openTab: (input) => useWorkspaceLayoutStore.getState().openTab(input),
    rememberLastWorkspace: (selection) => lastWorkspaceSelectionStore.remember(selection),
    navigateToRoute: (route) => {
      navigateToHostWorkspaceRoute(route);
      stripHostWorkspaceRouteEchoSearchFromBrowserUrlAfterCommit();
    },
  };
}

export function hydrateLastWorkspaceSelection(): Promise<void> {
  return lastWorkspaceSelectionStore.hydrate();
}

export function getLastWorkspaceSelection(): ActiveWorkspaceSelection | null {
  return lastWorkspaceSelectionStore.getSelection();
}

export function getIsLastWorkspaceSelectionHydrated(): boolean {
  return lastWorkspaceSelectionStore.isHydrated();
}

export function navigateToWorkspace(input: NavigateToWorkspaceInput): string {
  return navigateToWorkspacePure(input, navigateDeps());
}

export function navigateToLastWorkspace(): boolean {
  return navigateToLastWorkspacePure({
    ...navigateDeps(),
    getLastWorkspaceSelection: () => lastWorkspaceSelectionStore.getSelection(),
  });
}

export function useActiveWorkspaceSelection(): ActiveWorkspaceSelection | null {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    workspaceId?: string | string[];
  }>();
  const selection = parseActiveWorkspaceSelection({ pathname: usePathname(), params });
  const serverId = selection?.serverId ?? null;
  const workspaceId = selection?.workspaceId ?? null;
  useEffect(() => {
    if (!serverId || !workspaceId) {
      return;
    }
    lastWorkspaceSelectionStore.remember({ serverId, workspaceId });
  }, [serverId, workspaceId]);
  return selection;
}

export function useLastWorkspaceSelection(): ActiveWorkspaceSelection | null {
  return useSyncExternalStore(
    lastWorkspaceSelectionStore.subscribe,
    getLastWorkspaceSelection,
    getLastWorkspaceSelection,
  );
}

export function useIsLastWorkspaceSelectionHydrated(): boolean {
  return useSyncExternalStore(
    lastWorkspaceSelectionStore.subscribe,
    getIsLastWorkspaceSelectionHydrated,
    getIsLastWorkspaceSelectionHydrated,
  );
}

void hydrateLastWorkspaceSelection();
