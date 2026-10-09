import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useSessionStore } from "@/stores/session-store";
import { resolveCloseAgentConfirmation } from "@/subagents/close-tab-policy";
import { confirmDialog } from "@/utils/confirm-dialog";
import { toErrorMessage } from "@/utils/error-messages";

/**
 * Archives a chat from a menu: asks first with the same dialog `Cmd+W` shows (the stronger
 * warning while the chat is running), then archives on the host. The chat leaves the sidebar at
 * once and comes back if the host refuses.
 */
export function useArchiveChat(serverId: string): (agentId: string) => Promise<void> {
  const { t } = useTranslation();
  const toast = useToast();
  const { archiveAgent } = useArchiveAgent();

  return useCallback(
    async (agentId) => {
      const agent = useSessionStore.getState().sessions[serverId]?.agents.get(agentId) ?? null;
      const running = resolveCloseAgentConfirmation(agent) === "archive-running";
      const confirmed = await confirmDialog({
        title: running
          ? t("workspace.tabs.confirmations.archiveRunningAgentTitle")
          : t("workspace.tabs.confirmations.archiveAgentTitle"),
        message: running
          ? t("workspace.tabs.confirmations.archiveRunningAgentMessage")
          : t("workspace.tabs.confirmations.archiveAgentMessage"),
        confirmLabel: t("workspace.tabs.confirmations.archive"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      try {
        await archiveAgent({ serverId, agentId });
      } catch (error) {
        toast.error(toErrorMessage(error) || t("workspace.tabs.toasts.failedToArchiveChat"));
      }
    },
    [archiveAgent, serverId, t, toast],
  );
}
