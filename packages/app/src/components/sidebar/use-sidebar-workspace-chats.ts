import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import {
  areSidebarChatsEqual,
  buildWorkspaceChatIndex,
  type SidebarChat,
} from "@/components/sidebar/workspace-chats";

const NO_CHATS: readonly SidebarChat[] = [];

// One pass over a host's agents serves every workspace row listed under it, so each row's
// selector is two map lookups until that host's agents change. The agents map is replaced on
// every update, which is also what retires the cached index.
const chatIndexByAgents = new WeakMap<
  ReadonlyMap<string, Agent>,
  ReadonlyMap<string, readonly SidebarChat[]>
>();

function readChatIndex(agents: ReadonlyMap<string, Agent>) {
  const cached = chatIndexByAgents.get(agents);
  if (cached) {
    return cached;
  }
  const built = buildWorkspaceChatIndex(agents);
  chatIndexByAgents.set(agents, built);
  return built;
}

export function selectSidebarWorkspaceChats(
  state: { sessions: Record<string, { agents: ReadonlyMap<string, Agent> } | undefined> },
  input: { serverId: string; workspaceId: string },
): readonly SidebarChat[] {
  const agents = state.sessions[input.serverId]?.agents;
  const workspaceId = normalizeWorkspaceOpaqueId(input.workspaceId);
  if (!agents || !workspaceId) {
    return NO_CHATS;
  }
  return readChatIndex(agents).get(workspaceId) ?? NO_CHATS;
}

/**
 * A workspace's root chats for the sidebar. The result keeps its identity until a chat in this
 * workspace changes, so an agent update elsewhere on the host does not re-render the group.
 */
export function useSidebarWorkspaceChats(input: {
  serverId: string;
  workspaceId: string;
}): readonly SidebarChat[] {
  return useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectSidebarWorkspaceChats(state, input),
    areSidebarChatsEqual,
  );
}

/** The chat the host currently shows, so its row reads as selected. */
export function useFocusedChatId(serverId: string): string | null {
  return useSessionStore((state) => state.sessions[serverId]?.focusedAgentId ?? null);
}

/**
 * Whether the workspace's chat list is open and shows the focused chat. The workspace row then
 * stays unhighlighted, so only the chat the user is in reads as selected.
 */
export function useWorkspaceListsFocusedChat(input: {
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
}): boolean {
  const chats = useSidebarWorkspaceChats({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
  });
  const focusedChatId = useFocusedChatId(input.serverId);
  const collapsed = useSidebarCollapsedSectionsStore((state) =>
    state.collapsedWorkspaceChatKeys.has(input.workspaceKey),
  );
  return !collapsed && focusedChatId !== null && chats.some((chat) => chat.id === focusedChatId);
}
