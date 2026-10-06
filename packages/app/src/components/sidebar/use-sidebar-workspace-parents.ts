import { useMemo, useRef } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore, type Agent, type WorkspaceDescriptor } from "@/stores/session-store";
import {
  areWorkspaceParentMapsEqual,
  deriveWorkspaceParentMap,
  type WorkspaceParentMap,
} from "@/components/sidebar/workspace-nesting";

const EMPTY_PARENTS: WorkspaceParentMap = new Map();

interface ServerNestingSnapshot {
  serverId: string;
  agents: ReadonlyMap<string, Agent>;
  workspaces: ReadonlyMap<string, WorkspaceDescriptor>;
}

const EMPTY_SNAPSHOTS: ServerNestingSnapshot[] = [];

function areServerNestingSnapshotsEqual(
  left: readonly ServerNestingSnapshot[],
  right: readonly ServerNestingSnapshot[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      !a ||
      !b ||
      a.serverId !== b.serverId ||
      a.agents !== b.agents ||
      a.workspaces !== b.workspaces
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Child workspace -> direct parent workspace, scoped to `serverIds`. Keyed the same way as
 * `SidebarWorkspaceEntry.workspaceKey` (`${serverId}:${workspaceId}`) on both sides.
 *
 * Two memo layers keep this off the hot path (see coding-standards.md's selector-cost rule):
 * the zustand selector only extracts the `agents` and `workspaces` map references per server —
 * O(1) reads, stable unless that server's agents or workspace list actually changed — and the
 * O(agents) derivation itself lives in a `useMemo` gated on those references, not in the
 * selector. Even when a server's `agents` map legitimately gets a new reference (any agent
 * update replaces it), the result is compared structurally against the previous map, so an
 * update that doesn't move any workspace's root-agent parentage (status ticks, streaming,
 * timestamps) returns the same `Map` instance and skips re-rendering every reader.
 */
export function useSidebarWorkspaceParents(serverIds: readonly string[]): WorkspaceParentMap {
  const snapshots = useStoreWithEqualityFn(
    useSessionStore,
    (state): ServerNestingSnapshot[] => {
      const next: ServerNestingSnapshot[] = [];
      for (const serverId of serverIds) {
        const session = state.sessions[serverId];
        if (!session) {
          continue;
        }
        next.push({ serverId, agents: session.agents, workspaces: session.workspaces });
      }
      return next.length > 0 ? next : EMPTY_SNAPSHOTS;
    },
    areServerNestingSnapshotsEqual,
  );

  const previousRef = useRef<WorkspaceParentMap>(EMPTY_PARENTS);

  return useMemo(() => {
    if (snapshots.length === 0) {
      previousRef.current = EMPTY_PARENTS;
      return EMPTY_PARENTS;
    }
    const next = deriveWorkspaceParentMap(
      snapshots.map((snapshot) => ({
        serverId: snapshot.serverId,
        agents: snapshot.agents,
        visibleWorkspaceIds: snapshot.workspaces,
      })),
    );
    if (areWorkspaceParentMapsEqual(previousRef.current, next)) {
      return previousRef.current;
    }
    previousRef.current = next;
    return next;
  }, [snapshots]);
}
