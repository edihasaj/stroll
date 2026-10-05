import type { PluginSidebarGroup } from "@/plugins/sidebar-groups";
import type { BuiltinSidebarNavId, SidebarNavItem } from "@/sidebar-nav/model";

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
  pluginItems: PluginSidebarGroup[];
}

/** Which of the panel's two header/new-chat affordances the same preference list allows. */
export interface SidebarPanelDerivedItems {
  showNewChat: boolean;
  showNewWorkspace: boolean;
  showSearch: boolean;
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
      .map((item) => (item as Extract<SidebarNavItem, { kind: "plugin" }>).group),
  };
}

export function deriveSidebarPanelItems(
  items: readonly SidebarNavItem[],
): SidebarPanelDerivedItems {
  return {
    showNewChat: isBuiltinVisible(items, "new-chat"),
    showNewWorkspace: isBuiltinVisible(items, "new-workspace"),
    showSearch: isBuiltinVisible(items, "search"),
  };
}
