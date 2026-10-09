import { describe, expect, it } from "vitest";
import {
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setNestedWorkspaceExpanded,
  setProjectCollapsed,
  togglePinnedCollapsed,
  toggleNestedWorkspaceExpanded,
  toggleProjectCollapsed,
  toggleWorkspaceChatsCollapsed,
  toggleWorkspaceGroupCollapsed,
} from "@/stores/sidebar-collapsed-sections-store/state";

function emptyState(): CollapsedProjectsState {
  return {
    collapsedProjectKeys: new Set(),
    collapsedWorkspaceGroupKeys: new Set(),
    collapsedPinned: false,
    expandedNestedWorkspaceKeys: new Set(),
    collapsedWorkspaceChatKeys: new Set(),
  };
}

describe("sidebar collapsed projects transitions", () => {
  it("tracks collapsed project keys as a Set", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "project-a", true);
    state = toggleProjectCollapsed(state, "project-b");
    state = toggleProjectCollapsed(state, "project-a");
    state = toggleWorkspaceGroupCollapsed(state, "running");

    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-b"]);
    expect(Array.from(state.collapsedWorkspaceGroupKeys)).toEqual(["running"]);
  });

  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedWorkspaceGroupKeys: new Set(["running"]),
      collapsedPinned: true,
      expandedNestedWorkspaceKeys: new Set(["s1:w-parent"]),
      collapsedWorkspaceChatKeys: new Set(["s1:w-folded"]),
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedWorkspaceGroupKeys: ["running"],
      collapsedPinned: true,
      expandedNestedWorkspaceKeys: ["s1:w-parent"],
      collapsedWorkspaceChatKeys: ["s1:w-folded"],
    });
  });

  it("toggles and restores the pinned section collapse flag", () => {
    const toggled = togglePinnedCollapsed(emptyState());
    expect(toggled.collapsedPinned).toBe(true);

    const restored = mergePersistedCollapsedProjects({ collapsedPinned: true }, emptyState());
    expect(restored.collapsedPinned).toBe(true);
  });

  it("rejects the complete value when a persisted project key is invalid", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a", "project-b", 42] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual([]);
    expect(Array.from(restored.collapsedWorkspaceGroupKeys)).toEqual([]);
  });

  it("keeps the existing state object when persisted preferences do not change collapsed keys", () => {
    const currentState = emptyState();

    expect(mergePersistedCollapsedProjects(undefined, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({}, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({ collapsedProjectKeys: [] }, currentState)).toBe(
      currentState,
    );
  });

  it("expands and collapses a nested workspace parent, collapsed by default", () => {
    let state = emptyState();
    expect(state.expandedNestedWorkspaceKeys.has("s1:w-parent")).toBe(false);

    state = toggleNestedWorkspaceExpanded(state, "s1:w-parent");
    expect(Array.from(state.expandedNestedWorkspaceKeys)).toEqual(["s1:w-parent"]);

    state = toggleNestedWorkspaceExpanded(state, "s1:w-parent");
    expect(Array.from(state.expandedNestedWorkspaceKeys)).toEqual([]);
  });

  it("sets nested-expanded explicitly and is a no-op when already at that value", () => {
    const state = emptyState();

    const expanded = setNestedWorkspaceExpanded(state, "s1:w-parent", true);
    expect(Array.from(expanded.expandedNestedWorkspaceKeys)).toEqual(["s1:w-parent"]);

    const unchanged = setNestedWorkspaceExpanded(expanded, "s1:w-parent", true);
    expect(unchanged).toBe(expanded);

    const collapsedAgain = setNestedWorkspaceExpanded(expanded, "s1:w-parent", false);
    expect(Array.from(collapsedAgain.expandedNestedWorkspaceKeys)).toEqual([]);
  });

  it("round-trips expanded nested workspace keys through persistence", () => {
    const restored = mergePersistedCollapsedProjects(
      { expandedNestedWorkspaceKeys: ["s1:w-parent", "s1:w-mid"] },
      emptyState(),
    );

    expect(Array.from(restored.expandedNestedWorkspaceKeys).sort()).toEqual([
      "s1:w-mid",
      "s1:w-parent",
    ]);
  });

  it("tracks workspaces whose chat list is folded away and restores them", () => {
    let state = emptyState();

    state = toggleWorkspaceChatsCollapsed(state, "s1:w1");
    state = toggleWorkspaceChatsCollapsed(state, "s1:w2");
    state = toggleWorkspaceChatsCollapsed(state, "s1:w1");

    expect(Array.from(state.collapsedWorkspaceChatKeys)).toEqual(["s1:w2"]);
    const restored = mergePersistedCollapsedProjects(
      { collapsedWorkspaceChatKeys: ["s1:w3"] },
      emptyState(),
    );
    expect(Array.from(restored.collapsedWorkspaceChatKeys)).toEqual(["s1:w3"]);
  });

  it("keeps chat lists unfolded for a persisted value that predates them", () => {
    const restored = mergePersistedCollapsedProjects({ collapsedPinned: true }, emptyState());

    expect(restored.collapsedWorkspaceChatKeys.size).toBe(0);
  });
});
