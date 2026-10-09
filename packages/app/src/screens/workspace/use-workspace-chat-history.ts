import { useCallback, useEffect, useMemo } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { buildWorkspaceKeyboardHandlerId } from "@/keyboard/handler-id";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { useSessionStore } from "@/stores/session-store";
import {
  useWorkspaceChatHistoryStore,
  type ChatHistoryEntry,
} from "@/stores/workspace-chat-history-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import type { WorkspaceLayout } from "@/stores/workspace-layout-actions";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { resolveMainPane, useIsSingleChatMain } from "@/workspace-tabs/single-chat";

interface HistoryAgentIdInput {
  layout: WorkspaceLayout | null;
  tabs: readonly WorkspaceTab[];
  explorerSidebarPaneId: string | null;
  /** The chat in the focused pane; stands in where the main view still holds several tabs. */
  focusedPaneAgentId: string | null;
}

/**
 * The chat to record in the history. With one chat in the main view that is the main pane's chat,
 * even while the side pane has focus; otherwise it is the focused pane's chat.
 */
export function useHistoryAgentId(input: HistoryAgentIdInput): string | null {
  const { layout, tabs, explorerSidebarPaneId, focusedPaneAgentId } = input;
  const isSingleChatMain = useIsSingleChatMain();
  return useMemo(() => {
    if (!isSingleChatMain) {
      return focusedPaneAgentId;
    }
    const mainPane = layout ? resolveMainPane(layout.root, explorerSidebarPaneId) : null;
    const mainTab = tabs.find((tab) => tab.tabId === mainPane?.focusedTabId);
    return mainTab?.target.kind === "agent" ? mainTab.target.agentId : null;
  }, [explorerSidebarPaneId, focusedPaneAgentId, isSingleChatMain, layout, tabs]);
}

interface UseWorkspaceChatHistoryInput {
  serverId: string;
  workspaceId: string;
  /** The chat showing in the main view, or null when it holds a draft or nothing. */
  activeAgentId: string | null;
  agentsHydrated: boolean;
  /** The workspace's non-archived agents; a change means a chat may have been archived or deleted. */
  activeAgentIds: ReadonlySet<string>;
  /** Whether this workspace is the one on screen; only it records opens and answers the keys. */
  isRouteFocused: boolean;
}

/**
 * A chat counts while its agent exists and is not archived. A host whose agents have not loaded
 * yet gets the benefit of the doubt, so a reconnect does not empty the history.
 */
function isChatLive(entry: ChatHistoryEntry): boolean {
  const session = useSessionStore.getState().sessions[entry.serverId];
  if (!session?.hasHydratedAgents) {
    return true;
  }
  const agent = session.agents.get(entry.agentId);
  return Boolean(agent) && !agent?.archivedAt;
}

/**
 * Records the chats the main view shows, across every workspace, and answers Previous chat / Next
 * chat. A chat opened by any route (sidebar, notification, Command Center) lands in the history
 * the moment it becomes the focused workspace's main chat, so the history needs no knowledge of
 * how it was opened. Going back to a chat in another workspace is a normal agent navigation.
 */
export function useWorkspaceChatHistory(input: UseWorkspaceChatHistoryInput): void {
  const { serverId, workspaceId, activeAgentId, agentsHydrated, activeAgentIds, isRouteFocused } =
    input;

  useEffect(() => {
    if (!isRouteFocused || !activeAgentId) {
      return;
    }
    useWorkspaceChatHistoryStore
      .getState()
      .recordOpen({ serverId, workspaceId, agentId: activeAgentId });
  }, [activeAgentId, isRouteFocused, serverId, workspaceId]);

  useEffect(() => {
    if (!agentsHydrated) {
      return;
    }
    useWorkspaceChatHistoryStore.getState().prune(isChatLive);
  }, [agentsHydrated, activeAgentIds]);

  const handleAction = useCallback((action: KeyboardActionDefinition): boolean => {
    if (action.id !== "workspace.chat.navigate-relative") {
      return false;
    }
    const entry = useWorkspaceChatHistoryStore.getState().step(action.delta, isChatLive);
    if (entry) {
      navigateToAgent({
        serverId: entry.serverId,
        agentId: entry.agentId,
        workspaceId: entry.workspaceId,
      });
    }
    return true;
  }, []);

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
