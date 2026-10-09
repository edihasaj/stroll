import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_CHAT_HISTORY,
  MAX_CHAT_HISTORY_ENTRIES,
  pruneChatHistory,
  recordChatOpen,
  stepChatHistory,
  useWorkspaceChatHistoryStore,
  type ChatHistory,
  type ChatHistoryEntry,
} from "./workspace-chat-history-store";

function chat(agentId: string, workspaceId = "w1", serverId = "s"): ChatHistoryEntry {
  return { serverId, workspaceId, agentId };
}

function agentIds(history: ChatHistory): string[] {
  return history.entries.map((entry) => entry.agentId);
}

function openAll(ids: string[]): ChatHistory {
  return ids.reduce<ChatHistory>(
    (history, agentId) => recordChatOpen(history, chat(agentId)),
    EMPTY_CHAT_HISTORY,
  );
}

function liveIds(...ids: string[]) {
  const live = new Set(ids);
  return (entry: ChatHistoryEntry) => live.has(entry.agentId);
}

const everyChatLive = () => true;

describe("recordChatOpen", () => {
  it("appends opened chats and points the cursor at the newest", () => {
    const history = openAll(["a", "b", "c"]);

    expect(agentIds(history)).toEqual(["a", "b", "c"]);
    expect(history.cursor).toBe(2);
  });

  it("ignores re-opening the chat the cursor already points at", () => {
    const history = openAll(["a", "b"]);

    expect(recordChatOpen(history, chat("b"))).toBe(history);
  });

  it("does not rewrite the history when stepping back re-opens the chat", () => {
    const back = stepChatHistory(openAll(["a", "b", "c"]), -1, everyChatLive).history;

    expect(recordChatOpen(back, chat("b"))).toBe(back);
  });

  it("drops the chats ahead of the cursor when a new chat opens after stepping back", () => {
    const back = stepChatHistory(openAll(["a", "b", "c"]), -1, everyChatLive).history;
    const next = recordChatOpen(back, chat("d"));

    expect(agentIds(next)).toEqual(["a", "b", "d"]);
    expect(next.cursor).toBe(2);
  });

  it("moves a chat seen earlier to the end instead of listing it twice", () => {
    const history = openAll(["a", "b", "c", "a"]);

    expect(agentIds(history)).toEqual(["b", "c", "a"]);
    expect(history.cursor).toBe(2);
  });

  it("keeps only the most recent chats", () => {
    const ids = Array.from({ length: MAX_CHAT_HISTORY_ENTRIES + 5 }, (_, index) => `chat-${index}`);
    const history = openAll(ids);

    expect(history.entries).toHaveLength(MAX_CHAT_HISTORY_ENTRIES);
    expect(history.entries.at(-1)?.agentId).toBe(ids.at(-1));
    expect(history.cursor).toBe(MAX_CHAT_HISTORY_ENTRIES - 1);
  });

  it("lists chats from different workspaces and hosts in one history", () => {
    const history = [
      chat("a", "w1"),
      chat("b", "w2"),
      chat("c", "w1", "other-server"),
    ].reduce<ChatHistory>(recordChatOpen, EMPTY_CHAT_HISTORY);

    expect(history.entries).toEqual([
      { serverId: "s", workspaceId: "w1", agentId: "a" },
      { serverId: "s", workspaceId: "w2", agentId: "b" },
      { serverId: "other-server", workspaceId: "w1", agentId: "c" },
    ]);
  });

  it("treats the same agent id on two hosts as two chats", () => {
    const history = [chat("a", "w1", "s1"), chat("a", "w1", "s2")].reduce<ChatHistory>(
      recordChatOpen,
      EMPTY_CHAT_HISTORY,
    );

    expect(history.entries.map((entry) => entry.serverId)).toEqual(["s1", "s2"]);
  });
});

describe("stepChatHistory", () => {
  it("walks back and forward through the opened chats", () => {
    const start = openAll(["a", "b", "c"]);
    const first = stepChatHistory(start, -1, everyChatLive);
    const second = stepChatHistory(first.history, -1, everyChatLive);
    const forward = stepChatHistory(second.history, 1, everyChatLive);

    expect([first, second, forward].map((step) => step.entry?.agentId)).toEqual(["b", "a", "b"]);
  });

  it("returns the workspace the chat was opened in", () => {
    const history = [chat("a", "w1"), chat("b", "w2")].reduce<ChatHistory>(
      recordChatOpen,
      EMPTY_CHAT_HISTORY,
    );

    expect(stepChatHistory(history, -1, everyChatLive).entry).toEqual(chat("a", "w1"));
  });

  it("stops at either end without moving the cursor", () => {
    const history = openAll(["a", "b"]);

    expect(stepChatHistory(history, 1, everyChatLive)).toEqual({ history, entry: null });
    const oldest = stepChatHistory(history, -1, everyChatLive).history;
    expect(stepChatHistory(oldest, -1, everyChatLive)).toEqual({ history: oldest, entry: null });
  });

  it("has nowhere to go in an empty history", () => {
    expect(stepChatHistory(EMPTY_CHAT_HISTORY, -1, everyChatLive).entry).toBeNull();
    expect(stepChatHistory(EMPTY_CHAT_HISTORY, 1, everyChatLive).entry).toBeNull();
  });

  it("skips chats that are archived or deleted", () => {
    const history = openAll(["a", "b", "c"]);

    const back = stepChatHistory(history, -1, liveIds("a", "c"));

    expect(back.entry?.agentId).toBe("a");
    expect(back.history.cursor).toBe(0);
  });

  it("stays put when every chat in that direction is gone", () => {
    const history = openAll(["a", "b", "c"]);

    expect(stepChatHistory(history, -1, liveIds("c"))).toEqual({ history, entry: null });
  });
});

describe("pruneChatHistory", () => {
  it("keeps the same history when every chat is still live", () => {
    const history = openAll(["a", "b"]);

    expect(pruneChatHistory(history, everyChatLive)).toBe(history);
  });

  it("drops archived chats and keeps the cursor on the chat it was on", () => {
    const history = stepChatHistory(openAll(["a", "b", "c", "d"]), -1, everyChatLive).history;

    const withoutFirst = pruneChatHistory(history, liveIds("b", "c", "d"));
    expect(agentIds(withoutFirst)).toEqual(["b", "c", "d"]);
    expect(withoutFirst.cursor).toBe(1);

    const withoutSecond = pruneChatHistory(history, liveIds("a", "c", "d"));
    expect(agentIds(withoutSecond)).toEqual(["a", "c", "d"]);
    expect(withoutSecond.cursor).toBe(1);
  });

  it("moves the cursor back to the previous live chat when the current one is gone", () => {
    const pruned = pruneChatHistory(openAll(["a", "b", "c"]), liveIds("a", "b"));

    expect(agentIds(pruned)).toEqual(["a", "b"]);
    expect(pruned.cursor).toBe(1);
  });

  it("empties the history when nothing is live", () => {
    expect(pruneChatHistory(openAll(["a", "b"]), liveIds())).toEqual(EMPTY_CHAT_HISTORY);
  });

  it("lets forward reach the next chat when every earlier one was pruned", () => {
    const history = stepChatHistory(
      stepChatHistory(openAll(["a", "b", "c"]), -1, everyChatLive).history,
      -1,
      everyChatLive,
    ).history;
    const pruned = pruneChatHistory(history, liveIds("b", "c"));

    expect(agentIds(pruned)).toEqual(["b", "c"]);
    expect(pruned.cursor).toBe(-1);
    expect(stepChatHistory(pruned, 1, everyChatLive).entry?.agentId).toBe("b");
  });
});

describe("useWorkspaceChatHistoryStore", () => {
  beforeEach(() => {
    useWorkspaceChatHistoryStore.setState({ history: EMPTY_CHAT_HISTORY });
  });

  it("steps across workspaces through one history", () => {
    const store = useWorkspaceChatHistoryStore.getState();
    store.recordOpen(chat("a", "w1"));
    store.recordOpen(chat("x", "w2"));
    store.recordOpen(chat("b", "w1"));

    expect(store.step(-1, everyChatLive)).toEqual(chat("x", "w2"));
    expect(store.step(-1, everyChatLive)).toEqual(chat("a", "w1"));
    expect(store.step(1, everyChatLive)).toEqual(chat("x", "w2"));
  });

  it("returns null and leaves the history alone at the ends", () => {
    const store = useWorkspaceChatHistoryStore.getState();
    store.recordOpen(chat("a"));
    store.recordOpen(chat("b"));
    const before = useWorkspaceChatHistoryStore.getState().history;

    expect(store.step(1, everyChatLive)).toBeNull();
    expect(useWorkspaceChatHistoryStore.getState().history).toBe(before);
  });

  it("prunes archived chats from every workspace", () => {
    const store = useWorkspaceChatHistoryStore.getState();
    store.recordOpen(chat("a", "w1"));
    store.recordOpen(chat("x", "w2"));
    store.recordOpen(chat("b", "w1"));
    store.prune(liveIds("x", "b"));

    const { history } = useWorkspaceChatHistoryStore.getState();
    expect(agentIds(history)).toEqual(["x", "b"]);
    expect(history.cursor).toBe(1);
  });
});
