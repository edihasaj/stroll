import type { PluginSidebarGroup } from "@/plugins/sidebar-groups";
import type { BuiltinSidebarNavId, SidebarNavItem } from "@/sidebar-nav/model";

/** A legacy `addSidebarItem` group: the only plugin sidebar item shape with a single icon,
 * so the only one the rail can render as one of its 34px buttons. A current-shape
 * `addSidebarHeaderItem`/`addSidebarFooterItem` group renders an arbitrary component sized
 * for a full-width row and has no rail equivalent — the panel renders those instead, see
 * `PanelPluginSidebarGroup` below. */
type RailPluginSidebarGroup = Extract<PluginSidebarGroup, { kind: "legacy" }>;

/** A current-shape `addSidebarHeaderItem` group: a full-width component with no icon-only rail
 * form (the complement of `RailPluginSidebarGroup`). The panel renders these itself — see
 * `sidebar-panel.tsx` — in the same relative order Mobile's `SidebarNavRows` gives them. */
type PanelPluginSidebarGroup = Extract<PluginSidebarGroup, { kind: "item" }>;

/**
 * Which of the rail's fixed route icons the user's sidebar-nav-items preference allows, plus
 * the plugin-contributed items that render as extra rail icons. Chats, Projects, and Settings
 * are not part of `BUILTIN_SIDEBAR_NAV_IDS` — they are not optional, so they carry no visibility
 * check here. A builtin id the preference list has not placed yet defaults to visible, matching
 * `resolveSidebarNavItems`'s own default.
 */
export interface SidebarRailDerivedItems {
  showSchedules: boolean;
  /** History has no rail icon of its own — it is a row inside the rail's More menu. */
  showHistoryInMore: boolean;
  pluginItems: RailPluginSidebarGroup[];
}

/** Which of the panel's two header/new-chat affordances the same preference list allows, plus
 * the current-shape plugin header items the panel renders directly (see `PanelPluginSidebarGroup`
 * above). */
export interface SidebarPanelDerivedItems {
  showNewChat: boolean;
  showNewWorkspace: boolean;
  showSearch: boolean;
  pluginItems: PanelPluginSidebarGroup[];
}

function isBuiltinVisible(items: readonly SidebarNavItem[], id: BuiltinSidebarNavId): boolean {
  const item = items.find((candidate) => candidate.kind === "builtin" && candidate.id === id);
  return item ? item.visible : true;
}

export function deriveSidebarRailItems(items: readonly SidebarNavItem[]): SidebarRailDerivedItems {
  return {
    showSchedules: isBuiltinVisible(items, "schedules"),
    showHistoryInMore: isBuiltinVisible(items, "history"),
    pluginItems: items
      .filter((item) => item.kind === "plugin" && item.visible)
      .map((item) => (item as Extract<SidebarNavItem, { kind: "plugin" }>).group)
      .filter((group): group is RailPluginSidebarGroup => group.kind === "legacy"),
  };
}

export function deriveSidebarPanelItems(
  items: readonly SidebarNavItem[],
): SidebarPanelDerivedItems {
  return {
    showNewChat: isBuiltinVisible(items, "new-chat"),
    showNewWorkspace: isBuiltinVisible(items, "new-workspace"),
    showSearch: isBuiltinVisible(items, "search"),
    pluginItems: items
      .filter((item) => item.kind === "plugin" && item.visible)
      .map((item) => (item as Extract<SidebarNavItem, { kind: "plugin" }>).group)
      .filter((group): group is PanelPluginSidebarGroup => group.kind === "item"),
  };
}
