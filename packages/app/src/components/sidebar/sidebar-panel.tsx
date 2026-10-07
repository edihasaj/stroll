import { useMemo, useRef, type ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SidebarAgentListSkeleton } from "@/components/sidebar-agent-list-skeleton";
import { SidebarWorkspaceList } from "@/components/sidebar-workspace-list";
import { SidebarCalloutSlot } from "@/components/sidebar-callout-slot";
import { PluginSidebarItem } from "@/plugins/sidebar-items";
import { usePanelStore } from "@/stores/panel-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { deriveSidebarPanelItems } from "./sidebar-rail-model";
import { SidebarNewChatRow } from "./sidebar-new-chat-row";
import { SidebarPanelFooter } from "./sidebar-panel-footer";
import { SidebarPanelHeader } from "./sidebar-panel-header";
import { SidebarPanelProjectsHeader } from "./sidebar-panel-projects-header";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import type { SidebarWorkspaceGroup } from "@/components/sidebar/sidebar-labels";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import type { SidebarGroupMode } from "@/stores/sidebar-view-store";

/**
 * The desktop sidebar's 240px panel (Codex parity): header, New chat row, the collapsible
 * Projects section, and the footer identity — everything that used to live in the single
 * expanded-width column, minus the brand row and top nav rows the rail now owns.
 */
export function SidebarPanel({
  workspaceGroups,
  projectIconTargets,
  pinnedGroups,
  projects,
  hasProjectsBeforeFilter,
  hasActiveProjectFilter,
  workspaceEntriesByKey,
  isInitialLoad,
  isManualRefresh,
  isRevalidating,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleOpenProject,
  handleImportSession,
  handleAddHost,
  handleOpenHostSettings,
}: {
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  projects: SidebarProjectEntry[];
  hasProjectsBeforeFilter: boolean;
  hasActiveProjectFilter: boolean;
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  isInitialLoad: boolean;
  isManualRefresh: boolean;
  isRevalidating: boolean;
  groupMode: SidebarGroupMode;
  collapsedProjectKeys: ReadonlySet<string>;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  handleRefresh: () => void;
  handleOpenProject: () => void;
  handleImportSession: () => void;
  handleAddHost: () => void;
  handleOpenHostSettings: (serverId: string) => void;
}) {
  const { items } = useSidebarNavItems("header");
  const panelItems = useMemo(() => deriveSidebarPanelItems(items), [items]);
  const projectsCollapsed = usePanelStore((state) => state.desktop.projectsSectionCollapsed);
  const hasActiveHostFilter = useSidebarViewStore((state) => state.hostFilters.length > 0);
  const pluginHeaderItemsRef = useRef<View | null>(null);

  let projectsBody: ReactElement | null = null;
  if (!projectsCollapsed) {
    projectsBody =
      isInitialLoad && !hasActiveHostFilter ? (
        <SidebarAgentListSkeleton />
      ) : (
        <SidebarWorkspaceList
          collapsedProjectKeys={collapsedProjectKeys}
          onToggleProjectCollapsed={toggleProjectCollapsed}
          shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
          groupMode={groupMode}
          workspaceGroups={workspaceGroups}
          projectIconTargets={projectIconTargets}
          pinnedGroups={pinnedGroups}
          projects={projects}
          hasProjectsBeforeFilter={hasProjectsBeforeFilter}
          hasActiveProjectFilter={hasActiveProjectFilter}
          workspaceEntriesByKey={workspaceEntriesByKey}
          isRefreshing={isManualRefresh && isRevalidating}
          onRefresh={handleRefresh}
          onAddProject={handleOpenProject}
          onImportSession={handleImportSession}
        />
      );
  }

  return (
    <View style={styles.panel} testID="sidebar-panel">
      <SidebarPanelHeader showSearch={panelItems.showSearch} />
      <SidebarNewChatRow
        showNewChat={panelItems.showNewChat}
        showNewWorkspace={panelItems.showNewWorkspace}
      />
      {panelItems.pluginItems.length > 0 ? (
        <View ref={pluginHeaderItemsRef} collapsable={false} style={styles.pluginHeaderItems}>
          {panelItems.pluginItems.map((group) => (
            <PluginSidebarItem
              key={group.key}
              group={group}
              section="header"
              fallbackAnchorRef={pluginHeaderItemsRef}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.scrollArea}>
        <SidebarPanelProjectsHeader />
        {projectsBody}
        <SidebarCalloutSlot />
      </View>
      <SidebarPanelFooter onAddHost={handleAddHost} onOpenHostSettings={handleOpenHostSettings} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    flex: 1,
    minHeight: 0,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  // Same vertical rhythm as Mobile's `sidebarHeaderGroup` nav rows (`left-sidebar.tsx`) — these
  // are the same current-shape `addSidebarHeaderItem` rows, just not interleaved with the
  // builtins, which the rail and the row above already render in fixed positions.
  pluginHeaderItems: {
    gap: 2,
  },
}));
