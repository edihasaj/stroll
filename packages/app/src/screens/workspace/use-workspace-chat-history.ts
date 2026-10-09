import { useCallback, useEffect } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { buildWorkspaceKeyboardHandlerId } from "@/keyboard/handler-id";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { useWorkspaceChatHistoryStore } from "@/stores/workspace-chat-history-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";

interface UseWorkspaceChatHistoryInput {
  serverId: string;
  workspaceId: string;
  persistenceKey: string | null;
  /** The chat showing in the focused pane, or null when a non-chat tab is showing. */
  activeAgentId: string | null;
  /** The workspace's non-archived root chats; subagents open beside their parent and are skipped. */
  rootAgentIds: ReadonlySet<string>;
  agentsHydrated: boolean;
  isRouteFocused: boolean;
}

/**
 * Remembers the chats a workspace opens and answers Previous chat / Next chat. A chat opened by
 * any route (sidebar, notification, Command Center) lands in the history the moment it becomes
 * the focused pane's chat, so the history needs no knowledge of how it was opened.
 */
export function useWorkspaceChatHistory(input: UseWorkspaceChatHistoryInput): void {
  const {
    serverId,
    workspaceId,
    persistenceKey,
    activeAgentId,
    rootAgentIds,
    agentsHydrated,
    isRouteFocused,
  } = input;

  useEffect(() => {
    if (!persistenceKey || !activeAgentId || !rootAgentIds.has(activeAgentId)) {
      return;
    }
    useWorkspaceChatHistoryStore.getState().recordOpen(persistenceKey, activeAgentId);
  }, [activeAgentId, persistenceKey, rootAgentIds]);

  useEffect(() => {
    if (!persistenceKey || !agentsHydrated) {
      return;
    }
    useWorkspaceChatHistoryStore.getState().prune(persistenceKey, rootAgentIds);
  }, [agentsHydrated, persistenceKey, rootAgentIds]);

  const handleAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id !== "workspace.chat.navigate-relative" || !persistenceKey) {
        return false;
      }
      const agentId = useWorkspaceChatHistoryStore.getState().step(persistenceKey, action.delta);
      if (agentId) {
        navigateToAgent({ serverId, agentId, workspaceId });
      }
      return true;
    },
    [persistenceKey, serverId, workspaceId],
  );

  useKeyboardActionHandler({
    handlerId: buildWorkspaceKeyboardHandlerId({
      name: "workspace-chat-history",
      serverId,
      workspaceId,
    }),
    actions: ["workspace.chat.navigate-relative"] as const,
    enabled: isRouteFocused && Boolean(serverId && workspaceId),
    priority: 100,
    handle: handleAction,
  });
}
