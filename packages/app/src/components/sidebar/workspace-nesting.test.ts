import { describe, expect, it } from "vitest";
import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";
import {
  areWorkspaceParentMapsEqual,
  collectDescendantWorkspaces,
  deriveWorkspaceParentMap,
  flattenVisibleNestedWorkspaces,
  groupWorkspacesByNesting,
  type WorkspaceNestingAgent,
  type WorkspaceNestingServerInput,
} from "@/components/sidebar/workspace-nesting";

function agent(input: {
  id: string;
  workspaceId: string | undefined;
  parentAgentId?: string | null;
  archivedAt?: Date | null;
  createdAt: string;
}): WorkspaceNestingAgent {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    parentAgentId: input.parentAgentId ?? null,
    archivedAt: input.archivedAt ?? null,
    createdAt: new Date(input.createdAt),
  };
}

function server(
  serverId: string,
  agents: WorkspaceNestingAgent[],
  visibleWorkspaceIds: readonly string[],
): WorkspaceNestingServerInput {
  return {
    serverId,
    agents: new Map(agents.map((entry) => [entry.id, entry])),
    visibleWorkspaceIds: new Set(visibleWorkspaceIds),
  };
}

function placement(input: { serverId: string; workspaceId: string }): SidebarWorkspacePlacement {
  return {
    workspaceKey: `${input.serverId}:${input.workspaceId}`,
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    projectViewKey: "project-a",
    projectName: "Project A",
    projectKind: "git",
    workspaceKind: "worktree",
    name: input.workspaceId,
  };
}

describe("deriveWorkspaceParentMap", () => {
  it("maps a child workspace to the workspace its root agent's parent lives in", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({ id: "parent-agent", workspaceId: "w-parent", createdAt: "2026-01-01T00:00:00Z" }),
          agent({
            id: "child-agent",
            workspaceId: "w-child",
            parentAgentId: "parent-agent",
            createdAt: "2026-01-02T00:00:00Z",
          }),
        ],
        ["w-parent", "w-child"],
      ),
    ]);

    expect(map.get("s1:w-child")).toBe("s1:w-parent");
    expect(map.size).toBe(1);
  });

  it("uses the earliest non-archived agent as a workspace's root, ignoring a yet-earlier archived one", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({ id: "parent-agent", workspaceId: "w-parent", createdAt: "2026-01-01T00:00:00Z" }),
          agent({
            id: "archived-earliest",
            workspaceId: "w-child",
            parentAgentId: null,
            archivedAt: new Date("2026-01-02T00:00:01Z"),
            createdAt: "2026-01-02T00:00:00Z",
          }),
          agent({
            id: "real-root",
            workspaceId: "w-child",
            parentAgentId: "parent-agent",
            createdAt: "2026-01-02T00:00:01Z",
          }),
        ],
        ["w-parent", "w-child"],
      ),
    ]);

    expect(map.get("s1:w-child")).toBe("s1:w-parent");
  });

  it("does not nest when the parent agent's workspace is not currently visible", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({ id: "parent-agent", workspaceId: "w-parent", createdAt: "2026-01-01T00:00:00Z" }),
          agent({
            id: "child-agent",
            workspaceId: "w-child",
            parentAgentId: "parent-agent",
            createdAt: "2026-01-02T00:00:00Z",
          }),
        ],
        ["w-child"],
      ),
    ]);

    expect(map.size).toBe(0);
  });

  it("does not nest when the parent agent is unknown", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({
            id: "child-agent",
            workspaceId: "w-child",
            parentAgentId: "missing-parent",
            createdAt: "2026-01-02T00:00:00Z",
          }),
        ],
        ["w-child"],
      ),
    ]);

    expect(map.size).toBe(0);
  });

  it("chains a grandchild under its own direct parent, not the top ancestor", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({ id: "root-agent", workspaceId: "w-root", createdAt: "2026-01-01T00:00:00Z" }),
          agent({
            id: "mid-agent",
            workspaceId: "w-mid",
            parentAgentId: "root-agent",
            createdAt: "2026-01-02T00:00:00Z",
          }),
          agent({
            id: "leaf-agent",
            workspaceId: "w-leaf",
            parentAgentId: "mid-agent",
            createdAt: "2026-01-03T00:00:00Z",
          }),
        ],
        ["w-root", "w-mid", "w-leaf"],
      ),
    ]);

    expect(map.get("s1:w-mid")).toBe("s1:w-root");
    expect(map.get("s1:w-leaf")).toBe("s1:w-mid");
  });

  it("keeps parentage scoped to one server, even when agent ids collide across servers", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({ id: "same-id", workspaceId: "w-parent-1", createdAt: "2026-01-01T00:00:00Z" }),
          agent({
            id: "child-1",
            workspaceId: "w-child-1",
            parentAgentId: "same-id",
            createdAt: "2026-01-02T00:00:00Z",
          }),
        ],
        ["w-parent-1", "w-child-1"],
      ),
      server(
        "s2",
        [
          agent({
            id: "child-2",
            workspaceId: "w-child-2",
            parentAgentId: "same-id",
            createdAt: "2026-01-02T00:00:00Z",
          }),
        ],
        ["w-child-2"],
      ),
    ]);

    expect(map.get("s1:w-child-1")).toBe("s1:w-parent-1");
    expect(map.has("s2:w-child-2")).toBe(false);
  });

  it("breaks a cycle instead of looping, keeping every other edge", () => {
    const map = deriveWorkspaceParentMap([
      server(
        "s1",
        [
          agent({
            id: "a",
            workspaceId: "w-a",
            parentAgentId: "b",
            createdAt: "2026-01-01T00:00:00Z",
          }),
          agent({
            id: "b",
            workspaceId: "w-b",
            parentAgentId: "a",
            createdAt: "2026-01-01T00:00:00Z",
          }),
        ],
        ["w-a", "w-b"],
      ),
    ]);

    // Exactly one direction of the 2-cycle survives.
    const hasAtoB = map.get("s1:w-a") === "s1:w-b";
    const hasBtoA = map.get("s1:w-b") === "s1:w-a";
    expect(hasAtoB !== hasBtoA).toBe(true);
    expect(map.size).toBe(1);
  });
});

describe("areWorkspaceParentMapsEqual", () => {
  it("treats two maps with identical entries as equal, independent of identity", () => {
    const left = new Map([["s1:w-child", "s1:w-parent"]]);
    const right = new Map([["s1:w-child", "s1:w-parent"]]);
    expect(areWorkspaceParentMapsEqual(left, right)).toBe(true);
  });

  it("is false when sizes differ", () => {
    const left = new Map([["s1:w-child", "s1:w-parent"]]);
    const right = new Map();
    expect(areWorkspaceParentMapsEqual(left, right)).toBe(false);
  });

  it("is false when a value differs", () => {
    const left = new Map([["s1:w-child", "s1:w-parent"]]);
    const right = new Map([["s1:w-child", "s1:w-other"]]);
    expect(areWorkspaceParentMapsEqual(left, right)).toBe(false);
  });
});

describe("groupWorkspacesByNesting", () => {
  it("removes a child from the top level when its parent is in the same list", () => {
    const parent = placement({ serverId: "s1", workspaceId: "w-parent" });
    const child = placement({ serverId: "s1", workspaceId: "w-child" });
    const result = groupWorkspacesByNesting({
      workspaces: [parent, child],
      parentByChildKey: new Map([[child.workspaceKey, parent.workspaceKey]]),
    });

    expect(result.topLevel).toEqual([parent]);
    expect(result.childrenByParentKey.get(parent.workspaceKey)).toEqual([child]);
  });

  it("keeps a child at the top level when its parent is not in the same list", () => {
    const child = placement({ serverId: "s1", workspaceId: "w-child" });
    const result = groupWorkspacesByNesting({
      workspaces: [child],
      parentByChildKey: new Map([[child.workspaceKey, "s1:w-parent-elsewhere"]]),
    });

    expect(result.topLevel).toEqual([child]);
    expect(result.childrenByParentKey.size).toBe(0);
  });

  it("files a grandchild under its direct parent, leaving the root with one direct child", () => {
    const root = placement({ serverId: "s1", workspaceId: "w-root" });
    const mid = placement({ serverId: "s1", workspaceId: "w-mid" });
    const leaf = placement({ serverId: "s1", workspaceId: "w-leaf" });
    const result = groupWorkspacesByNesting({
      workspaces: [root, mid, leaf],
      parentByChildKey: new Map([
        [mid.workspaceKey, root.workspaceKey],
        [leaf.workspaceKey, mid.workspaceKey],
      ]),
    });

    expect(result.topLevel).toEqual([root]);
    expect(result.childrenByParentKey.get(root.workspaceKey)).toEqual([mid]);
    expect(result.childrenByParentKey.get(mid.workspaceKey)).toEqual([leaf]);
  });
});

describe("collectDescendantWorkspaces", () => {
  it("collects children and grandchildren, deduplicated", () => {
    const mid = placement({ serverId: "s1", workspaceId: "w-mid" });
    const leaf = placement({ serverId: "s1", workspaceId: "w-leaf" });
    const childrenByParentKey = new Map([
      ["s1:w-root", [mid]],
      [mid.workspaceKey, [leaf]],
    ]);

    const descendants = collectDescendantWorkspaces({
      rootKey: "s1:w-root",
      childrenByParentKey,
    });

    expect(descendants.map((entry) => entry.workspaceKey).sort()).toEqual(
      ["s1:w-mid", "s1:w-leaf"].sort(),
    );
  });

  it("returns nothing for a childless root", () => {
    expect(
      collectDescendantWorkspaces({ rootKey: "s1:w-root", childrenByParentKey: new Map() }),
    ).toEqual([]);
  });
});

describe("flattenVisibleNestedWorkspaces", () => {
  const root = placement({ serverId: "s1", workspaceId: "w-root" });
  const mid = placement({ serverId: "s1", workspaceId: "w-mid" });
  const leaf = placement({ serverId: "s1", workspaceId: "w-leaf" });
  const childrenByParentKey = new Map([
    [root.workspaceKey, [mid]],
    [mid.workspaceKey, [leaf]],
  ]);

  it("hides every descendant while the parent is collapsed", () => {
    const flattened = flattenVisibleNestedWorkspaces({
      topLevel: [root],
      childrenByParentKey,
      isExpanded: () => false,
    });

    expect(flattened).toEqual([root]);
  });

  it("orders a child right after its parent once expanded", () => {
    const flattened = flattenVisibleNestedWorkspaces({
      topLevel: [root],
      childrenByParentKey,
      isExpanded: (key) => key === root.workspaceKey,
    });

    expect(flattened).toEqual([root, mid]);
  });

  it("hides a grandchild while its own parent (the middle node) stays collapsed", () => {
    const flattened = flattenVisibleNestedWorkspaces({
      topLevel: [root],
      childrenByParentKey,
      isExpanded: (key) => key === root.workspaceKey && key !== mid.workspaceKey,
    });

    expect(flattened).toEqual([root, mid]);
  });

  it("shows a grandchild once every ancestor down to it is expanded", () => {
    const flattened = flattenVisibleNestedWorkspaces({
      topLevel: [root],
      childrenByParentKey,
      isExpanded: () => true,
    });

    expect(flattened).toEqual([root, mid, leaf]);
  });
});
