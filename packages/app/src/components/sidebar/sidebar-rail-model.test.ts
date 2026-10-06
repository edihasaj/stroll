import { describe, expect, it } from "vitest";
import type { PluginSidebarGroup } from "@/plugins/sidebar-groups";
import { resolveSidebarNavItems } from "@/sidebar-nav/model";
import { deriveSidebarPanelItems, deriveSidebarRailItems } from "./sidebar-rail-model";

type LegacyPluginSidebarGroup = Extract<PluginSidebarGroup, { kind: "legacy" }>;
type ItemPluginSidebarGroup = Extract<PluginSidebarGroup, { kind: "item" }>;

/** A legacy `addSidebarItem` group — the only shape with a single icon, so the only one
 * the rail can render. */
function legacyPluginGroup(
  overrides: Partial<LegacyPluginSidebarGroup> = {},
): LegacyPluginSidebarGroup {
  return {
    kind: "legacy",
    key: "plugin:demo:panel",
    pluginId: "demo",
    contributionId: "panel",
    title: "Demo",
    icon: "plug",
    targets: [],
    ...overrides,
  };
}

/** A current-shape `addSidebarHeaderItem`/`addSidebarFooterItem` group — renders an
 * arbitrary full-width component and has no rail icon. */
function itemPluginGroup(overrides: Partial<ItemPluginSidebarGroup> = {}): ItemPluginSidebarGroup {
  return {
    kind: "item",
    key: "plugin:demo:item",
    pluginId: "demo",
    contributionId: "item",
    title: "Demo",
    targets: [],
    ...overrides,
  };
}

describe("deriveSidebarRailItems", () => {
  it("shows every fixed rail affordance by default, with no plugin items", () => {
    const items = resolveSidebarNavItems({ section: "header", pluginGroups: [], preferences: [] });
    expect(deriveSidebarRailItems(items)).toEqual({
      showSchedules: true,
      showHistoryInMore: true,
      pluginItems: [],
    });
  });

  it("hides the Schedules rail icon when the user hid it in Appearance settings", () => {
    const items = resolveSidebarNavItems({
      section: "header",
      pluginGroups: [],
      preferences: [{ key: "schedules", visible: false }],
    });
    expect(deriveSidebarRailItems(items).showSchedules).toBe(false);
  });

  it("drops History from the More menu when the user hid it", () => {
    const items = resolveSidebarNavItems({
      section: "header",
      pluginGroups: [],
      preferences: [{ key: "history", visible: false }],
    });
    expect(deriveSidebarRailItems(items).showHistoryInMore).toBe(false);
  });

  it("includes only visible legacy plugin items, as rail icons", () => {
    const visible = legacyPluginGroup({ key: "plugin:demo:visible", contributionId: "visible" });
    const hidden = legacyPluginGroup({ key: "plugin:demo:hidden", contributionId: "hidden" });
    const items = resolveSidebarNavItems({
      section: "header",
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

  it("excludes a current-shape addSidebarHeaderItem group — it has no single icon to show", () => {
    const item = itemPluginGroup({ key: "plugin:demo:item" });
    const items = resolveSidebarNavItems({
      section: "header",
      pluginGroups: [item],
      preferences: [{ key: item.key, visible: true }],
    });
    expect(deriveSidebarRailItems(items).pluginItems).toEqual([]);
  });

  it("is unaffected by new-workspace/new-chat/search visibility — those live in the panel", () => {
    const items = resolveSidebarNavItems({
      section: "header",
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
    const items = resolveSidebarNavItems({ section: "header", pluginGroups: [], preferences: [] });
    expect(deriveSidebarPanelItems(items)).toEqual({
      showNewChat: true,
      showNewWorkspace: true,
      showSearch: true,
    });
  });

  it("hides New chat independently of the trailing New workspace plus icon", () => {
    const items = resolveSidebarNavItems({
      section: "header",
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
      section: "header",
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
      section: "header",
      pluginGroups: [],
      preferences: [{ key: "search", visible: false }],
    });
    expect(deriveSidebarPanelItems(items).showSearch).toBe(false);
  });

  it("is unaffected by history/schedules visibility — those live in the rail", () => {
    const items = resolveSidebarNavItems({
      section: "header",
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
