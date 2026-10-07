import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useSessionStore } from "@/stores/session-store";
import {
  createArchiveFinishedSubagents,
  type ArchiveFinishedOutcome,
  type ArchiveFinishedState,
  type ArchiveFinishedSubagents,
} from "./archive-finished";
import { useProviderSubagentStore } from "./provider-store";
import { findAgentHostServerId, type SubagentRow } from "./select";

export type { ArchiveFinishedStatus } from "./archive-finished";

export interface UseArchiveFinishedSubagentsInput {
  serverId: string;
  parentAgentId: string;
  rows: readonly SubagentRow[];
}

export interface ArchiveFinishedSubagentsCapability extends ArchiveFinishedState {
  archiveFinished: () => Promise<ArchiveFinishedOutcome>;
}

export function useArchiveFinishedSubagents({
  serverId,
  parentAgentId,
  rows,
}: UseArchiveFinishedSubagentsInput): ArchiveFinishedSubagentsCapability {
  const { archiveAgent } = useArchiveAgent();
  const archiveFinished = useMemo<ArchiveFinishedSubagents>(
    () =>
      createArchiveFinishedSubagents([], {
        parentServerId: serverId,
        parentAgentId,
        getManagedSubagent: (id) => {
          const sessions = useSessionStore.getState().sessions;
          const hostServerId = findAgentHostServerId(sessions, serverId, id) ?? serverId;
          return sessions[hostServerId]?.agents.get(id);
        },
        archiveManagedSubagent: (id) => {
          const hostServerId =
            findAgentHostServerId(useSessionStore.getState().sessions, serverId, id) ?? serverId;
          return archiveAgent({ serverId: hostServerId, agentId: id });
        },
        dismissProviderSubagents: (ids) => {
          useProviderSubagentStore.getState().hideFromTrack(serverId, parentAgentId, ids);
        },
      }),
    [archiveAgent, parentAgentId, serverId],
  );
  const state = useSyncExternalStore(
    archiveFinished.subscribe,
    archiveFinished.getState,
    archiveFinished.getState,
  );

  useEffect(() => {
    archiveFinished.setRows(rows);
  }, [archiveFinished, rows]);

  return { ...state, archiveFinished: archiveFinished.archiveFinished };
}
