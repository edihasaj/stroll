import { create } from "zustand";

export const MAX_CHAT_HISTORY_ENTRIES = 50;

/** A chat the user had open, and where it lives, so back and forward can cross workspaces. */
export interface ChatHistoryEntry {
  serverId: string;
  workspaceId: string;
  agentId: string;
}

/** Chats opened in any workspace, oldest first, and which of them is showing. */
export interface ChatHistory {
  entries: readonly ChatHistoryEntry[];
  /** Index into `entries`; -1 only while every entry before the next one was pruned. */
  cursor: number;
}

export type ChatHistoryLiveness = (entry: ChatHistoryEntry) => boolean;

export const EMPTY_CHAT_HISTORY: ChatHistory = { entries: [], cursor: -1 };

function isSameChat(left: ChatHistoryEntry, right: ChatHistoryEntry): boolean {
  return left.serverId === right.serverId && left.agentId === right.agentId;
}

/**
 * Records a chat becoming the open one. Opening the chat the cursor already points at is a no-op,
 * which is also how stepping back or forward through the history re-enters it without rewriting
 * it. Any other open drops the entries ahead of the cursor, as a browser does, and moves a chat
 * seen earlier to the end instead of listing it twice.
 */
export function recordChatOpen(history: ChatHistory, entry: ChatHistoryEntry): ChatHistory {
  const current = history.entries[history.cursor];
  if (current && isSameChat(current, entry)) {
    return history;
  }
  const kept = history.entries
    .slice(0, history.cursor + 1)
    .filter((candidate) => !isSameChat(candidate, entry));
  const entries = [...kept, entry].slice(-MAX_CHAT_HISTORY_ENTRIES);
  return { entries, cursor: entries.length - 1 };
}

/** Drops chats that are archived or deleted, keeping the cursor on the chat it was on. */
export function pruneChatHistory(history: ChatHistory, isLive: ChatHistoryLiveness): ChatHistory {
  const entries = history.entries.filter(isLive);
  if (entries.length === history.entries.length) {
    return history;
  }
  const keptThroughCursor = history.entries.slice(0, history.cursor + 1).filter(isLive).length;
  return { entries, cursor: keptThroughCursor - 1 };
}

export interface ChatHistoryStep {
  history: ChatHistory;
  entry: ChatHistoryEntry | null;
}

/**
 * Moves the cursor one live chat back (-1) or forward (+1); `entry` is null when no live chat is
 * left in that direction. Dead entries between are skipped, not removed: pruning owns removal.
 */
export function stepChatHistory(
  history: ChatHistory,
  delta: 1 | -1,
  isLive: ChatHistoryLiveness,
): ChatHistoryStep {
  for (
    let cursor = history.cursor + delta;
    cursor >= 0 && cursor < history.entries.length;
    cursor += delta
  ) {
    const entry = history.entries[cursor];
    if (isLive(entry)) {
      return { history: { entries: history.entries, cursor }, entry };
    }
  }
  return { history, entry: null };
}

interface ChatHistoryState {
  /** Not persisted: a restart opens the chat the layout saved and starts the history from there. */
  history: ChatHistory;
  recordOpen: (entry: ChatHistoryEntry) => void;
  prune: (isLive: ChatHistoryLiveness) => void;
  /** Steps the history and returns the chat to open, or null at either end. */
  step: (delta: 1 | -1, isLive: ChatHistoryLiveness) => ChatHistoryEntry | null;
}

export const useWorkspaceChatHistoryStore = create<ChatHistoryState>()((set, get) => ({
  history: EMPTY_CHAT_HISTORY,
  recordOpen: (entry) => set((state) => ({ history: recordChatOpen(state.history, entry) })),
  prune: (isLive) =>
    set((state) => {
      const history = pruneChatHistory(state.history, isLive);
      return history === state.history ? state : { history };
    }),
  step: (delta, isLive) => {
    const result = stepChatHistory(get().history, delta, isLive);
    if (result.entry !== null) {
      set({ history: result.history });
    }
    return result.entry;
  },
}));
