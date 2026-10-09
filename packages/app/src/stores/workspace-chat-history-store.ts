import { create } from "zustand";

export const MAX_CHAT_HISTORY_ENTRIES = 50;

/** Chats a workspace has opened, oldest first, and which of them is showing. */
export interface ChatHistory {
  entries: readonly string[];
  /** Index into `entries`; -1 only while every entry before the next one was pruned. */
  cursor: number;
}

export const EMPTY_CHAT_HISTORY: ChatHistory = { entries: [], cursor: -1 };

/**
 * Records a chat becoming the open one. Opening the chat the cursor already points at is a no-op,
 * which is also how stepping back or forward through the history re-enters it without rewriting
 * it. Any other open drops the entries ahead of the cursor, as a browser does, and moves a chat
 * seen earlier to the end instead of listing it twice.
 */
export function recordChatOpen(history: ChatHistory, agentId: string): ChatHistory {
  if (history.entries[history.cursor] === agentId) {
    return history;
  }
  const kept = history.entries.slice(0, history.cursor + 1).filter((id) => id !== agentId);
  const entries = [...kept, agentId].slice(-MAX_CHAT_HISTORY_ENTRIES);
  return { entries, cursor: entries.length - 1 };
}

/** Drops chats that are archived or deleted, keeping the cursor on the chat it was on. */
export function pruneChatHistory(
  history: ChatHistory,
  liveAgentIds: ReadonlySet<string>,
): ChatHistory {
  const entries = history.entries.filter((id) => liveAgentIds.has(id));
  if (entries.length === history.entries.length) {
    return history;
  }
  const keptThroughCursor = history.entries
    .slice(0, history.cursor + 1)
    .filter((id) => liveAgentIds.has(id)).length;
  return { entries, cursor: keptThroughCursor - 1 };
}

export interface ChatHistoryStep {
  history: ChatHistory;
  agentId: string | null;
}

/** Moves the cursor one chat back (-1) or forward (+1); `agentId` is null at either end. */
export function stepChatHistory(history: ChatHistory, delta: 1 | -1): ChatHistoryStep {
  const cursor = history.cursor + delta;
  const agentId = history.entries[cursor] ?? null;
  if (agentId === null) {
    return { history, agentId: null };
  }
  return { history: { entries: history.entries, cursor }, agentId };
}

interface WorkspaceChatHistoryState {
  /**
   * Per workspace key. Not persisted: a restart opens the chat the layout saved and starts the
   * history from there.
   */
  historyByWorkspace: Record<string, ChatHistory>;
  recordOpen: (workspaceKey: string, agentId: string) => void;
  prune: (workspaceKey: string, liveAgentIds: ReadonlySet<string>) => void;
  /** Steps the workspace's history and returns the chat to open, or null at either end. */
  step: (workspaceKey: string, delta: 1 | -1) => string | null;
}

function replaceHistory(
  state: WorkspaceChatHistoryState,
  workspaceKey: string,
  next: ChatHistory,
): Partial<WorkspaceChatHistoryState> {
  if (state.historyByWorkspace[workspaceKey] === next) {
    return state;
  }
  return { historyByWorkspace: { ...state.historyByWorkspace, [workspaceKey]: next } };
}

export const useWorkspaceChatHistoryStore = create<WorkspaceChatHistoryState>()((set, get) => ({
  historyByWorkspace: {},
  recordOpen: (workspaceKey, agentId) =>
    set((state) =>
      replaceHistory(
        state,
        workspaceKey,
        recordChatOpen(state.historyByWorkspace[workspaceKey] ?? EMPTY_CHAT_HISTORY, agentId),
      ),
    ),
  prune: (workspaceKey, liveAgentIds) =>
    set((state) => {
      const current = state.historyByWorkspace[workspaceKey];
      if (!current) {
        return state;
      }
      return replaceHistory(state, workspaceKey, pruneChatHistory(current, liveAgentIds));
    }),
  step: (workspaceKey, delta) => {
    const current = get().historyByWorkspace[workspaceKey] ?? EMPTY_CHAT_HISTORY;
    const result = stepChatHistory(current, delta);
    if (result.agentId !== null) {
      set((state) => replaceHistory(state, workspaceKey, result.history));
    }
    return result.agentId;
  },
}));
