import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { confirmDialog } from "@/utils/confirm-dialog";
import { toErrorMessage } from "@/utils/error-messages";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "./agent-history-query-key";
import { removeAgentFromCachedLists } from "./use-archive-agent";

export interface DeleteChatInput {
  agentId: string;
  /** The tab showing the chat, when the caller knows it; otherwise the chat's own tab is closed. */
  tabId?: string;
}

export interface DeleteChatDeps {
  confirm: () => Promise<boolean>;
  deleteOnHost: (agentId: string) => Promise<void>;
  afterDelete: (input: DeleteChatInput) => void;
  onError: (message: string) => void;
}

/**
 * Deleting a chat is permanent, so it asks first, deletes on the host, and only then drops the
 * chat from the app. A failed delete leaves the tab and lists untouched.
 */
export async function runDeleteChat(deps: DeleteChatDeps, input: DeleteChatInput): Promise<void> {
  if (!(await deps.confirm())) {
    return;
  }
  try {
    await deps.deleteOnHost(input.agentId);
  } catch (error) {
    deps.onError(toErrorMessage(error));
    return;
  }
  deps.afterDelete(input);
}

function dropDeletedChatFromApp(input: {
  queryClient: QueryClient;
  serverId: string;
  workspaceId: string;
  chat: DeleteChatInput;
}): void {
  const { queryClient, serverId, workspaceId, chat } = input;
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  if (workspaceKey) {
    const layout = useWorkspaceLayoutStore.getState();
    layout.unpinAgent(workspaceKey, chat.agentId);
    layout.hideAgent(workspaceKey, chat.agentId);
    layout.closeTab(
      workspaceKey,
      chat.tabId ?? buildDeterministicWorkspaceTabId({ kind: "agent", agentId: chat.agentId }),
    );
  }
  getHostRuntimeStore().restoreAgentSnapshot(serverId, chat.agentId, undefined);
  removeAgentFromCachedLists(queryClient, { serverId, agentId: chat.agentId });
  void queryClient.invalidateQueries({ queryKey: ["sidebarAgentsList", serverId] });
  void queryClient.invalidateQueries({ queryKey: ["allAgents", serverId] });
  void queryClient.invalidateQueries({ queryKey: agentHistoryQueryKey(serverId) });
  void queryClient.invalidateQueries({ queryKey: allAgentHistoryQueryRootKey() });
}

export function useDeleteChat(input: { serverId: string; workspaceId: string }) {
  const { serverId, workspaceId } = input;
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  return useCallback(
    (chat: DeleteChatInput): Promise<void> =>
      runDeleteChat(
        {
          confirm: () =>
            confirmDialog({
              title: t("workspace.tabs.confirmations.deleteChatTitle"),
              message: t("workspace.tabs.confirmations.deleteChatMessage"),
              confirmLabel: t("workspace.tabs.confirmations.deleteChat"),
              cancelLabel: t("workspace.tabs.confirmations.cancel"),
              destructive: true,
            }),
          deleteOnHost: async (agentId) => {
            const client = useSessionStore.getState().sessions[serverId]?.client ?? null;
            if (!client) {
              throw new Error(t("common.errors.daemonClientUnavailable"));
            }
            await client.deleteAgent(agentId);
          },
          afterDelete: (deleted) =>
            dropDeletedChatFromApp({ queryClient, serverId, workspaceId, chat: deleted }),
          onError: (message) => {
            console.error("[DeleteChat] Failed to delete chat", { message });
            toast.error(message || t("workspace.tabs.toasts.failedToDeleteChat"));
          },
        },
        chat,
      ),
    [queryClient, serverId, t, toast, workspaceId],
  );
}
