import { useEffect, useMemo } from "react";
import { usePendingArchiveAgentIds } from "@/hooks/use-archive-agent";
import equal from "fast-deep-equal";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { refreshProviderSubagents, useProviderSubagentStore } from "./provider-store";
import type { ProviderSubagentDescriptorPayload } from "@getpaseo/protocol/messages";
import {
  PARENT_COMPUTER_AGENT_LABEL,
  PARENT_COMPUTER_LABEL,
} from "@getpaseo/protocol/agent-labels";

export interface PaseoSubagentRow {
  kind: "paseo";
  id: Agent["id"];
  /** The host this row's agent lives on — the parent's own host for an ordinary subagent, or
   * another connected host's serverId for one spawned there via `create_agent` `computer`
   * (docs/peers.md). Every consumer that opens, stops, or archives a row routes through this
   * host, not the parent's. */
  hostServerId: string;
  provider: Agent["provider"];
  title: Agent["title"];
  /** Managed agents have a real title, so the union's task line is always absent for them. */
  description: null;
  subtitle: null;
  status: Agent["status"];
  turn: Agent["turn"];
  requiresAttention: Agent["requiresAttention"];
  createdAt: Agent["createdAt"];
  /** The agent's last completed turn — its elapsed-time window once finished. `null` when none
   * is recorded; never the record's generic `updatedAt` revision stamp. */
  lastTurn: { startedAt: Date; endedAt: Date } | null;
}

export interface ProviderSubagentRow {
  kind: "provider";
  id: string;
  /** Always the parent's own host — a provider-native child runs inside the parent's own
   * process and cannot live on another computer. Carried for symmetry with `PaseoSubagentRow` so
   * every row in the union answers "which host" the same way. */
  hostServerId: string;
  parentAgentId: string;
  parentSubagentId?: string | null;
  provider: ProviderSubagentDescriptorPayload["provider"];
  // `title` is the subagent type ("Explore", "general-purpose") and repeats across a fan-out;
  // `description` is the task it was given. Both are carried so presentation can choose which
  // one names the row — collapsing them here is what makes every row read alike.
  title: string | null;
  description: string | null;
  /** Compact provider-owned context. The app displays it without interpreting its contents. */
  subtitle: string | null;
  status: ProviderSubagentDescriptorPayload["status"];
  requiresAttention: boolean;
  createdAt: Date;
  /** When the provider last reported on this child — the end of the run once it has finished. */
  updatedAt: Date;
}

export type SubagentRow = PaseoSubagentRow | ProviderSubagentRow;

export interface SubagentTreeNode {
  key: string;
  row: SubagentRow;
  depth: number;
  children: SubagentTreeNode[];
}

type SessionStoreSnapshot = ReturnType<typeof useSessionStore.getState>;
type ProviderSubagentStoreSnapshot = ReturnType<typeof useProviderSubagentStore.getState>;

interface SelectSubagentsParams {
  serverId: string;
  parentAgentId: string;
  /** Select children of this provider subagent instead of children of the managed agent. */
  providerParentSubagentId?: string;
}

const EMPTY_SUBAGENT_ROWS: SubagentRow[] = [];
const EMPTY_PROVIDER_SUBAGENT_ROWS: ProviderSubagentRow[] = [];

/**
 * Whether the child is waiting on the user — a permission or an error. A finished child the user
 * has not opened yet also carries `requiresAttention` ("finished"); that is unread, not blocked,
 * so it belongs with the Done rows and folds away like any other finished child.
 */
function needsUserAction(agent: Agent): boolean {
  return agent.requiresAttention === true && agent.attentionReason !== "finished";
}

function toSubagentRow(agent: Agent, hostServerId: string): PaseoSubagentRow {
  return {
    kind: "paseo",
    id: agent.id,
    hostServerId,
    provider: agent.provider,
    title: agent.title,
    description: null,
    subtitle: null,
    status: agent.status,
    turn: agent.turn,
    requiresAttention: needsUserAction(agent),
    createdAt: agent.createdAt,
    lastTurn: agent.lastTurn ?? null,
  };
}

interface ManagedChildLocation {
  agent: Agent;
  hostServerId: string;
}

/**
 * Every non-archived agent that is a direct child of `(parentServerId, parentAgentId)`: a
 * same-host child via `parentAgentId` (docs/agent-lifecycle.md), or a child on another connected
 * host via the `stroll.parent.*` labels a peer-spawned agent carries (docs/peers.md). Paired with
 * the host that owns each one — a cross-host child's agent record lives in a different host's
 * session than its parent, so `parentAgentId` alone (daemon-local) cannot find it.
 *
 * Scans every connected host's agent map, same as the single-host scan this replaces — bounded by
 * the (small) number of connected hosts times their (small) agent counts, not a hot path.
 */
function findManagedChildren(
  sessions: SessionStoreSnapshot["sessions"],
  parentServerId: string,
  parentAgentId: string,
): ManagedChildLocation[] {
  const children: ManagedChildLocation[] = [];
  for (const [hostServerId, session] of Object.entries(sessions)) {
    const isParentHost = hostServerId === parentServerId;
    for (const agent of session.agents.values()) {
      if (agent.archivedAt) continue;
      const isChild = isParentHost
        ? agent.parentAgentId === parentAgentId
        : agent.labels[PARENT_COMPUTER_LABEL] === parentServerId &&
          agent.labels[PARENT_COMPUTER_AGENT_LABEL] === parentAgentId;
      if (isChild) children.push({ agent, hostServerId });
    }
  }
  return children;
}

/**
 * Which connected host an agent id actually lives on: `preferredServerId` when it is there
 * (the common case — a local subagent, or the pane's own agent), else whichever other connected
 * host's `agents`/`agentDetails` map has it, else `null` when no connected host knows it. Shared
 * by opening a subagent row (`use-open-subagent.ts`) and resolving a transcript `create_agent`
 * row's child (`transcript-row.tsx`) — both need to find a bare agent id among every connected
 * host rather than trust the pane's own host.
 */
export function findAgentHostServerId(
  sessions: SessionStoreSnapshot["sessions"],
  preferredServerId: string,
  agentId: string,
): string | null {
  const preferred = sessions[preferredServerId];
  if (preferred && (preferred.agents.has(agentId) || preferred.agentDetails.has(agentId))) {
    return preferredServerId;
  }
  for (const [hostServerId, session] of Object.entries(sessions)) {
    if (hostServerId === preferredServerId) continue;
    if (session.agents.has(agentId) || session.agentDetails.has(agentId)) {
      return hostServerId;
    }
  }
  return null;
}

function treeKey(row: SubagentRow): string {
  return row.kind === "paseo" ? `agent:${row.id}` : `provider:${row.parentAgentId}:${row.id}`;
}

function sortRows(rows: SubagentRow[]): SubagentRow[] {
  return rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

export function buildSubagentTree(
  state: SessionStoreSnapshot,
  providerState: ProviderSubagentStoreSnapshot,
  params: SelectSubagentsParams,
  pendingArchiveIds: ReadonlySet<string>,
  providerSubagentsSupported: boolean,
): SubagentTreeNode[] {
  if (!state.sessions[params.serverId]) return [];
  const buildForParent = (
    hostServerId: string,
    parentAgentId: string,
    depth: number,
    ancestors: ReadonlySet<string>,
  ): SubagentTreeNode[] => {
    const managed = findManagedChildren(state.sessions, hostServerId, parentAgentId)
      .filter(
        ({ agent, hostServerId: childHost }) =>
          !ancestors.has(agent.id) &&
          !(childHost === params.serverId && pendingArchiveIds.has(agent.id)),
      )
      .map(({ agent, hostServerId: childHost }) => toSubagentRow(agent, childHost));
    const provider = selectProviderSubagentsForParent(
      providerState,
      { serverId: hostServerId, parentAgentId },
      providerSubagentsSupported,
    );
    const buildProviderNode = (
      row: ProviderSubagentRow,
      providerDepth: number,
      providerAncestors: ReadonlySet<string>,
    ): SubagentTreeNode => {
      const key = treeKey(row);
      const nextAncestors = new Set(providerAncestors);
      nextAncestors.add(key);
      const children = provider
        .filter(
          (candidate) =>
            candidate.parentSubagentId === row.id && !nextAncestors.has(treeKey(candidate)),
        )
        .map((candidate) => buildProviderNode(candidate, providerDepth + 1, nextAncestors));
      return { key, row, depth: providerDepth, children };
    };
    const providerRoots = provider.filter((row) => (row.parentSubagentId ?? null) === null);
    return sortRows([...managed, ...providerRoots]).map((row): SubagentTreeNode => {
      const nextAncestors = new Set(ancestors);
      if (row.kind === "paseo") nextAncestors.add(row.id);
      return {
        key: treeKey(row),
        row,
        depth,
        children:
          row.kind === "paseo"
            ? buildForParent(row.hostServerId, row.id, depth + 1, nextAncestors)
            : buildProviderNode(row, depth, new Set()).children,
      };
    });
  };
  return buildForParent(params.serverId, params.parentAgentId, 0, new Set([params.parentAgentId]));
}

export function selectSubagentsForParent(
  state: SessionStoreSnapshot,
  params: SelectSubagentsParams,
  pendingArchiveIds: ReadonlySet<string>,
): SubagentRow[] {
  if (!state.sessions[params.serverId]) {
    return EMPTY_SUBAGENT_ROWS;
  }

  const rows: SubagentRow[] = [];
  for (const { agent, hostServerId } of findManagedChildren(
    state.sessions,
    params.serverId,
    params.parentAgentId,
  )) {
    if (hostServerId === params.serverId && pendingArchiveIds.has(agent.id)) {
      continue;
    }
    rows.push(toSubagentRow(agent, hostServerId));
  }

  if (rows.length === 0) {
    return EMPTY_SUBAGENT_ROWS;
  }

  rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  return rows;
}

export function selectProviderSubagentsForParent(
  state: ProviderSubagentStoreSnapshot,
  params: SelectSubagentsParams,
  supported: boolean,
  nestingSupported = false,
): ProviderSubagentRow[] {
  if (!supported) return EMPTY_PROVIDER_SUBAGENT_ROWS;
  if (params.providerParentSubagentId && !nestingSupported) return EMPTY_PROVIDER_SUBAGENT_ROWS;
  const rows: ProviderSubagentRow[] = [];
  const prefix = `${params.serverId}\0${params.parentAgentId}\0`;
  for (const [key, subagent] of state.descriptors) {
    if (!key.startsWith(prefix) || state.hiddenFromTrack.has(key)) continue;
    if (
      nestingSupported &&
      (subagent.parentSubagentId ?? null) !== (params.providerParentSubagentId ?? null)
    ) {
      continue;
    }
    rows.push({
      kind: "provider",
      id: subagent.id,
      hostServerId: params.serverId,
      parentAgentId: subagent.parentAgentId,
      parentSubagentId: subagent.parentSubagentId ?? null,
      provider: subagent.provider,
      title: subagent.title,
      description: subagent.description,
      subtitle: subagent.subtitle ?? null,
      status: subagent.status,
      requiresAttention: subagent.status === "failed",
      createdAt: new Date(subagent.createdAt),
      updatedAt: new Date(subagent.updatedAt),
    });
  }
  rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  return rows;
}

export function useSubagentsForParent(params: SelectSubagentsParams): SubagentRow[] {
  const pendingArchiveIds = usePendingArchiveAgentIds(params.serverId);
  const paseoRows = useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectSubagentsForParent(state, params, pendingArchiveIds),
    equal,
  );
  const supported = useSessionStore(
    (state) => state.sessions[params.serverId]?.serverInfo?.features?.providerSubagents === true,
  );
  const nestingSupported = useSessionStore(
    (state) =>
      state.sessions[params.serverId]?.serverInfo?.features?.providerSubagentNesting === true,
  );
  const providerRows = useStoreWithEqualityFn(
    useProviderSubagentStore,
    (state) => selectProviderSubagentsForParent(state, params, supported, nestingSupported),
    equal,
  );
  const client = useSessionStore((state) => state.sessions[params.serverId]?.client ?? null);

  useEffect(() => {
    if (!client || !supported) return;
    void refreshProviderSubagents(client, params.serverId, params.parentAgentId).catch(
      () => undefined,
    );
  }, [client, params.parentAgentId, params.serverId, supported]);

  return useMemo(() => {
    if (params.providerParentSubagentId) return providerRows;
    if (providerRows.length === 0) return paseoRows;
    const rows = [...paseoRows, ...providerRows];
    rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    return rows;
  }, [params.providerParentSubagentId, paseoRows, providerRows]);
}

export function useSubagentTreeForParent(params: SelectSubagentsParams): SubagentTreeNode[] {
  const pendingArchiveIds = usePendingArchiveAgentIds(params.serverId);
  const supported = useSessionStore(
    (state) => state.sessions[params.serverId]?.serverInfo?.features?.providerSubagents === true,
  );
  const providerState = useProviderSubagentStore();
  const tree = useStoreWithEqualityFn(
    useSessionStore,
    (state) => buildSubagentTree(state, providerState, params, pendingArchiveIds, supported),
    equal,
  );
  const client = useSessionStore((state) => state.sessions[params.serverId]?.client ?? null);

  useEffect(() => {
    if (!client || !supported) return;
    void refreshProviderSubagents(client, params.serverId, params.parentAgentId).catch(
      () => undefined,
    );
  }, [client, params.parentAgentId, params.serverId, supported]);

  return tree;
}
