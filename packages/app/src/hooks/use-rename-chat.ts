import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";

/**
 * Renames a chat on its host. Rejects when the host is unreachable or refuses, so the rename
 * modal that awaits it can show the failure instead of closing.
 */
export function useRenameChat(serverId: string): (agentId: string, title: string) => Promise<void> {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useCallback(
    async (agentId, title) => {
      const client = useSessionStore.getState().sessions[serverId]?.client ?? null;
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      await client.updateAgent(agentId, { name: title.trim() });
      void queryClient.invalidateQueries({ queryKey: ["sidebarAgentsList", serverId] });
      void queryClient.invalidateQueries({ queryKey: ["allAgents", serverId] });
    },
    [queryClient, serverId, t],
  );
}
