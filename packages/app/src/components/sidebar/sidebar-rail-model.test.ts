import { describe, expect, it } from "vitest";
import type { PluginSidebarGroup } from "@/plugins/sidebar-groups";
import { resolveSidebarNavItems } from "@/sidebar-nav/model";
import { deriveSidebarPanelItems, deriveSidebarRailItems } from "./sidebar-rail-model";

function pluginGroup(overrides: Partial<PluginSidebarGroup> = {}): PluginSidebarGroup {
  return {
    key: "plugin:demo:panel",
    pluginId: "demo",
    contributionId: "panel",
    title: "Demo",
    icon: "plug",
    targets: [],
    ...overrides,
  };
}

describe("deriveSidebarRailItems", () => {
  it("shows every fixed rail affordance by default, with no plugin items", () => {
    const items = resolveSidebarNavItems({ pluginGroups: [], preferences: [] });
    expect(deriveSidebarRailItems(items)).toEqual({
      showSchedules: true,
      showHistoryInMore: true,
      pluginItems: [],
    });
  });

  it("hides the Schedules rail icon when the user hid it in Appearance settings", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [{ key: "schedules", visible: false }],
    });
    expect(deriveSidebarRailItems(items).showSchedules).toBe(false);
  });

  it("drops History from the More menu when the user hid it", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [{ key: "history", visible: false }],
    });
    expect(deriveSidebarRailItems(items).showHistoryInMore).toBe(false);
  });

  it("includes only visible plugin-contributed items, as rail icons", () => {
    const visible = pluginGroup({ key: "plugin:demo:visible", contributionId: "visible" });
    const hidden = pluginGroup({ key: "plugin:demo:hidden", contributionId: "hidden" });
    const items = resolveSidebarNavItems({
      pluginGroups: [visible, hidden],
      preferences: [
        { key: visible.key, visible: true },
        { key: hidden.key, visible: false },
      ],
    });
    const derived = deriveSidebarRailItems(items);
    expect(derived.pluginItems).toHaveLength(1);
    expect(derived.pluginItems[0]?.key).toBe(visible.key);
  });

  it("is unaffected by new-workspace/new-chat/search visibility — those live in the panel", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [
        { key: "new-workspace", visible: false },
        { key: "new-chat", visible: false },
        { key: "search", visible: false },
      ],
    });
    expect(deriveSidebarRailItems(items)).toEqual({
      showSchedules: true,
      showHistoryInMore: true,
      pluginItems: [],
    });
  });
});

describe("deriveSidebarPanelItems", () => {
  it("shows New chat, New workspace, and Search by default", () => {
    const items = resolveSidebarNavItems({ pluginGroups: [], preferences: [] });
    expect(deriveSidebarPanelItems(items)).toEqual({
      showNewChat: true,
      showNewWorkspace: true,
      showSearch: true,
    });
  });

  it("hides New chat independently of the trailing New workspace plus icon", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [{ key: "new-chat", visible: false }],
    });
    expect(deriveSidebarPanelItems(items)).toEqual({
      showNewChat: false,
      showNewWorkspace: true,
      showSearch: true,
    });
  });

  it("hides New workspace independently of the New chat row", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [{ key: "new-workspace", visible: false }],
    });
    expect(deriveSidebarPanelItems(items)).toEqual({
      showNewChat: true,
      showNewWorkspace: false,
      showSearch: true,
    });
  });

  it("hides the header search button when Search is hidden", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [{ key: "search", visible: false }],
    });
    expect(deriveSidebarPanelItems(items).showSearch).toBe(false);
  });

  it("is unaffected by history/schedules visibility — those live in the rail", () => {
    const items = resolveSidebarNavItems({
      pluginGroups: [],
      preferences: [
        { key: "history", visible: false },
        { key: "schedules", visible: false },
      ],
    });
    expect(deriveSidebarPanelItems(items)).toEqual({
      showNewChat: true,
      showNewWorkspace: true,
      showSearch: true,
    });
  });
});
