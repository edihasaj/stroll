import { useCallback, useMemo } from "react";
import { useToast } from "@/contexts/toast-context";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { toErrorMessage } from "@/utils/error-messages";
import { requestArchiveSubagent, type ResolveArchiveSubagentDialogInput } from "./archive-subagent";
import type { SubagentRow } from "./select";

export { resolveArchiveSubagentDialog, requestArchiveSubagent } from "./archive-subagent";
export type {
  ArchiveSubagentDeps,
  RequestArchiveSubagentInput,
  ResolveArchiveSubagentDialogInput,
} from "./archive-subagent";

export interface UseArchiveSubagentInput {
  serverId: string;
  rows: readonly SubagentRow[];
}

/** Archives a subagent row on whichever host actually owns it (docs/peers.md "In the app"). */
export function useArchiveSubagent(input: UseArchiveSubagentInput): (subagentId: string) => void {
  const { archiveAgent } = useArchiveAgent();
  const { serverId, rows } = input;
  const toast = useToast();
  const hostServerIdById = useMemo(
    () => new Map(rows.map((row) => [row.id, row.hostServerId] as const)),
    [rows],
  );

  return useCallback(
    (subagentId: string) => {
      const hostServerId = hostServerIdById.get(subagentId) ?? serverId;
      void requestArchiveSubagent(
        { serverId: hostServerId, subagentId },
        {
          getSubagent: (id): ResolveArchiveSubagentDialogInput | undefined =>
            useSessionStore.getState().sessions[hostServerId]?.agents?.get(id),
          confirm: confirmDialog,
          archiveAgent,
          reportError: (error) => {
            toast.error(toErrorMessage(error));
          },
        },
      );
    },
    [archiveAgent, hostServerIdById, serverId, toast],
  );
}
