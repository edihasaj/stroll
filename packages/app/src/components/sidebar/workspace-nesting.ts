import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";

/**
 * The subset of `Agent` this module needs. Kept structural (not imported from
 * `@/stores/session-store`) so this pure module has no dependency on the session store's own
 * shape — callers adapt real `Agent` records, which already satisfy this shape.
 */
export interface WorkspaceNestingAgent {
  id: string;
  workspaceId?: string;
  parentAgentId: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
}

/** Only needs membership. A `Map` (e.g. a session's `workspaces`) satisfies this directly. */
interface WorkspaceIdLookup {
  has(workspaceId: string): boolean;
}

export interface WorkspaceNestingServerInput {
  serverId: string;
  agents: ReadonlyMap<string, WorkspaceNestingAgent>;
  /** Workspace ids this server currently shows a sidebar row for. */
  visibleWorkspaceIds: WorkspaceIdLookup;
}

/**
 * Child workspace key -> direct parent workspace key, both in `${serverId}:${workspaceId}` form
 * (matching `SidebarWorkspaceEntry.workspaceKey`).
 */
export type WorkspaceParentMap = ReadonlyMap<string, string>;

function workspaceKey(serverId: string, workspaceId: string): string {
  return `${serverId}:${workspaceId}`;
}

/**
 * A workspace's root agent is its earliest-created, non-archived agent — not necessarily one
 * with no parent. Fixed at the workspace's own creation moment, so a later root-level agent
 * created in the same workspace never reclassifies it.
 */
function findEarliestAgentByWorkspace(
  agents: ReadonlyMap<string, WorkspaceNestingAgent>,
): Map<string, WorkspaceNestingAgent> {
  const earliest = new Map<string, WorkspaceNestingAgent>();
  for (const agent of agents.values()) {
    if (agent.archivedAt || !agent.workspaceId) {
      continue;
    }
    const current = earliest.get(agent.workspaceId);
    if (!current || agent.createdAt.getTime() < current.createdAt.getTime()) {
      earliest.set(agent.workspaceId, agent);
    }
  }
  return earliest;
}

function deriveServerWorkspaceParents(input: WorkspaceNestingServerInput): Map<string, string> {
  const edges = new Map<string, string>();
  const rootAgentByWorkspace = findEarliestAgentByWorkspace(input.agents);

  for (const [childWorkspaceId, rootAgent] of rootAgentByWorkspace) {
    if (!rootAgent.parentAgentId) {
      continue;
    }
    const parentAgent = input.agents.get(rootAgent.parentAgentId);
    const parentWorkspaceId = parentAgent?.workspaceId;
    if (!parentWorkspaceId || parentWorkspaceId === childWorkspaceId) {
      continue;
    }
    if (
      !input.visibleWorkspaceIds.has(childWorkspaceId) ||
      !input.visibleWorkspaceIds.has(parentWorkspaceId)
    ) {
      continue;
    }
    edges.set(
      workspaceKey(input.serverId, childWorkspaceId),
      workspaceKey(input.serverId, parentWorkspaceId),
    );
  }

  return edges;
}

/**
 * Breaks any cycle left in a child->parent map by dropping one edge per cycle (the edge leaving
 * the node the walk loops back to). A cycle can only happen through parentage edited after the
 * fact (e.g. a workspace's root agent reassigned), not through normal creation order, but
 * rendering walks this map to compute nesting depth and must never spin.
 */
function breakWorkspaceParentCycles(edges: Map<string, string>): Map<string, string> {
  const result = new Map(edges);
  const visitState = new Map<string, "visiting" | "resolved">();

  for (const start of edges.keys()) {
    if (visitState.get(start) === "resolved") {
      continue;
    }
    const path: string[] = [];
    let current: string | undefined = start;
    while (current !== undefined) {
      const state = visitState.get(current);
      if (state === "visiting") {
        // Looped back to an ancestor on this walk — cut this node's own outgoing edge, which
        // breaks exactly this cycle and leaves every other edge on the path intact.
        result.delete(current);
        break;
      }
      if (state === "resolved") {
        break;
      }
      visitState.set(current, "visiting");
      path.push(current);
      current = result.get(current);
    }
    for (const node of path) {
      visitState.set(node, "resolved");
    }
  }

  return result;
}

/** Derives the full, cycle-free parent map across every given server. */
export function deriveWorkspaceParentMap(
  servers: readonly WorkspaceNestingServerInput[],
): Map<string, string> {
  const merged = new Map<string, string>();
  for (const server of servers) {
    for (const [childKey, parentKey] of deriveServerWorkspaceParents(server)) {
      merged.set(childKey, parentKey);
    }
  }
  return breakWorkspaceParentCycles(merged);
}

export function areWorkspaceParentMapsEqual(
  left: WorkspaceParentMap,
  right: WorkspaceParentMap,
): boolean {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
}

export interface WorkspaceNestingGroups {
  /** Workspaces from the input list whose parent is not in that same list. */
  topLevel: SidebarWorkspacePlacement[];
  /** Direct children, keyed by their parent's `workspaceKey`. Only parents with children appear. */
  childrenByParentKey: Map<string, SidebarWorkspacePlacement[]>;
}

/**
 * Splits one list of workspaces (e.g. a project's) into top-level entries and direct children,
 * keeping a workspace at the top level unless its parent is in the *same* list — a parent in a
 * different project, or filtered out, leaves the child flat rather than orphaned.
 *
 * Grouping is by direct parent only. A grandchild (parent itself nested) is filed under its own
 * direct parent, not the top-level ancestor — callers recurse through `childrenByParentKey` to
 * reach it, which is what lets a child-of-a-child render one indent level deeper.
 */
export function groupWorkspacesByNesting(input: {
  workspaces: readonly SidebarWorkspacePlacement[];
  parentByChildKey: WorkspaceParentMap;
}): WorkspaceNestingGroups {
  const keysInList = new Set(input.workspaces.map((workspace) => workspace.workspaceKey));
  const topLevel: SidebarWorkspacePlacement[] = [];
  const childrenByParentKey = new Map<string, SidebarWorkspacePlacement[]>();

  for (const workspace of input.workspaces) {
    const parentKey = input.parentByChildKey.get(workspace.workspaceKey);
    if (parentKey && parentKey !== workspace.workspaceKey && keysInList.has(parentKey)) {
      const siblings = childrenByParentKey.get(parentKey);
      if (siblings) {
        siblings.push(workspace);
      } else {
        childrenByParentKey.set(parentKey, [workspace]);
      }
      continue;
    }
    topLevel.push(workspace);
  }

  return { topLevel, childrenByParentKey };
}

/**
 * Every descendant of `rootKey` (children, grandchildren, ...), for rolling up status while the
 * parent is collapsed — a running or needs-input state several levels down must still surface on
 * the collapsed disclosure, not just a direct child's.
 */
export function collectDescendantWorkspaces(input: {
  rootKey: string;
  childrenByParentKey: ReadonlyMap<string, readonly SidebarWorkspacePlacement[]>;
}): SidebarWorkspacePlacement[] {
  const result: SidebarWorkspacePlacement[] = [];
  const visited = new Set<string>([input.rootKey]);
  const stack = [...(input.childrenByParentKey.get(input.rootKey) ?? [])];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || visited.has(next.workspaceKey)) {
      continue;
    }
    visited.add(next.workspaceKey);
    result.push(next);
    const children = input.childrenByParentKey.get(next.workspaceKey);
    if (children) {
      stack.push(...children);
    }
  }

  return result;
}

/**
 * Flattens top-level workspaces and their visible-expanded children into the order sidebar
 * shortcuts should number: a parent, then its children immediately after it, recursing only
 * while each ancestor on the way down is expanded. A collapsed parent's children (and everything
 * below them) are omitted outright so they never consume a shortcut number while hidden.
 */
export function flattenVisibleNestedWorkspaces(input: {
  topLevel: readonly SidebarWorkspacePlacement[];
  childrenByParentKey: ReadonlyMap<string, readonly SidebarWorkspacePlacement[]>;
  isExpanded: (workspaceKey: string) => boolean;
}): SidebarWorkspacePlacement[] {
  const result: SidebarWorkspacePlacement[] = [];

  const visit = (placement: SidebarWorkspacePlacement, ancestors: ReadonlySet<string>): void => {
    if (ancestors.has(placement.workspaceKey)) {
      return;
    }
    result.push(placement);
    if (!input.isExpanded(placement.workspaceKey)) {
      return;
    }
    const children = input.childrenByParentKey.get(placement.workspaceKey);
    if (!children || children.length === 0) {
      return;
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(placement.workspaceKey);
    for (const child of children) {
      visit(child, nextAncestors);
    }
  };

  for (const placement of input.topLevel) {
    visit(placement, new Set());
  }

  return result;
}
