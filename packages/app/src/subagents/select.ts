import { useEffect, useMemo } from "react";
import { usePendingArchiveAgentIds } from "@/hooks/use-archive-agent";
import equal from "fast-deep-equal";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { refreshProviderSubagents, useProviderSubagentStore } from "./provider-store";
import type { ProviderSubagentDescriptorPayload } from "@getpaseo/protocol/messages";

export interface PaseoSubagentRow {
  kind: "paseo";
  id: Agent["id"];
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

function toSubagentRow(agent: Agent): PaseoSubagentRow {
  return {
    kind: "paseo",
    id: agent.id,
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
  const agents = state.sessions[params.serverId]?.agents;
  if (!agents) return [];
  const buildForParent = (parentAgentId: string, depth: number, ancestors: ReadonlySet<string>) => {
    const managed = Array.from(agents.values())
      .filter(
        (agent) =>
          !agent.archivedAt &&
          !pendingArchiveIds.has(agent.id) &&
          agent.parentAgentId === parentAgentId &&
          !ancestors.has(agent.id),
      )
      .map(toSubagentRow);
    const provider = selectProviderSubagentsForParent(
      providerState,
      { serverId: params.serverId, parentAgentId },
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
            ? buildForParent(row.id, depth + 1, nextAncestors)
            : buildProviderNode(row, depth, new Set()).children,
      };
    });
  };
  return buildForParent(params.parentAgentId, 0, new Set([params.parentAgentId]));
}

export function selectSubagentsForParent(
  state: SessionStoreSnapshot,
  params: SelectSubagentsParams,
  pendingArchiveIds: ReadonlySet<string>,
): SubagentRow[] {
  const agents = state.sessions[params.serverId]?.agents;
  if (!agents || agents.size === 0) {
    return EMPTY_SUBAGENT_ROWS;
  }

  const rows: SubagentRow[] = [];
  for (const agent of agents.values()) {
    if (
      agent.archivedAt ||
      pendingArchiveIds.has(agent.id) ||
      agent.parentAgentId !== params.parentAgentId
    ) {
      continue;
    }
    rows.push(toSubagentRow(agent));
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
