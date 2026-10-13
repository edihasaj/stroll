import { useMemo, useRef } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { PluginSidebarItem } from "@/plugins/sidebar-items";
import { SidebarFooterRows } from "@/components/sidebar/sidebar-footer-rows";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { UsageSidebarRoot } from "@/usage";
import { deriveSidebarPanelItems } from "./sidebar-rail-model";
import { SidebarNewChatRow } from "./sidebar-new-chat-row";
import { SidebarDesktopCollections } from "./sidebar-desktop-collections";
import { SidebarPanelHeader } from "./sidebar-panel-header";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import type { SidebarWorkspaceGroup } from "@/components/sidebar/sidebar-labels";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import type { SidebarGroupMode } from "@/stores/sidebar-view-store";

/** Desktop navigation: New chat, explicit project folders, and ungrouped Recents. */
export function SidebarPanel({
  projects,
  isInitialLoad,
  pinnedGroups,
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
  const pluginHeaderItemsRef = useRef<View | null>(null);
  return (
    <View style={styles.panel} testID="sidebar-panel">
      <SidebarPanelHeader showSearch={panelItems.showSearch} />
      <SidebarNewChatRow showNewChat={panelItems.showNewChat} showNewWorkspace={false} />
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
      <SidebarDesktopCollections
        projects={projects}
        loading={isInitialLoad}
        pinned={pinnedGroups.pinnedChats}
      />
      <UsageSidebarRoot>
        <SidebarFooterRows />
      </UsageSidebarRoot>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  panel: {
    flex: 1,
    minHeight: 0,
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
