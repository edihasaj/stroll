import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_CHAT_HISTORY,
  MAX_CHAT_HISTORY_ENTRIES,
  pruneChatHistory,
  recordChatOpen,
  stepChatHistory,
  useWorkspaceChatHistoryStore,
  type ChatHistory,
} from "./workspace-chat-history-store";

function openAll(ids: string[]): ChatHistory {
  return ids.reduce(recordChatOpen, EMPTY_CHAT_HISTORY);
}

describe("recordChatOpen", () => {
  it("appends opened chats and points the cursor at the newest", () => {
    expect(openAll(["a", "b", "c"])).toEqual({ entries: ["a", "b", "c"], cursor: 2 });
  });

  it("ignores re-opening the chat the cursor already points at", () => {
    const history = openAll(["a", "b"]);

    expect(recordChatOpen(history, "b")).toBe(history);
  });

  it("does not rewrite the history when stepping back re-opens the chat", () => {
    const back = stepChatHistory(openAll(["a", "b", "c"]), -1).history;

    expect(recordChatOpen(back, "b")).toBe(back);
  });

  it("drops the chats ahead of the cursor when a new chat opens after stepping back", () => {
    const back = stepChatHistory(openAll(["a", "b", "c"]), -1).history;

    expect(recordChatOpen(back, "d")).toEqual({ entries: ["a", "b", "d"], cursor: 2 });
  });

  it("moves a chat seen earlier to the end instead of listing it twice", () => {
    expect(openAll(["a", "b", "c", "a"])).toEqual({ entries: ["b", "c", "a"], cursor: 2 });
  });

  it("keeps only the most recent chats", () => {
    const ids = Array.from({ length: MAX_CHAT_HISTORY_ENTRIES + 5 }, (_, index) => `chat-${index}`);
    const history = openAll(ids);

    expect(history.entries).toHaveLength(MAX_CHAT_HISTORY_ENTRIES);
    expect(history.entries.at(-1)).toBe(ids.at(-1));
    expect(history.cursor).toBe(MAX_CHAT_HISTORY_ENTRIES - 1);
  });
});

describe("stepChatHistory", () => {
  it("walks back and forward through the opened chats", () => {
    const start = openAll(["a", "b", "c"]);
    const first = stepChatHistory(start, -1);
    const second = stepChatHistory(first.history, -1);
    const forward = stepChatHistory(second.history, 1);

    expect([first.agentId, second.agentId, forward.agentId]).toEqual(["b", "a", "b"]);
  });

  it("stops at either end without moving the cursor", () => {
    const history = openAll(["a", "b"]);

    expect(stepChatHistory(history, 1)).toEqual({ history, agentId: null });
    const oldest = stepChatHistory(history, -1).history;
    expect(stepChatHistory(oldest, -1)).toEqual({ history: oldest, agentId: null });
  });

  it("has nowhere to go in an empty history", () => {
    expect(stepChatHistory(EMPTY_CHAT_HISTORY, -1).agentId).toBeNull();
    expect(stepChatHistory(EMPTY_CHAT_HISTORY, 1).agentId).toBeNull();
  });
});

describe("pruneChatHistory", () => {
  it("keeps the same history when every chat is still live", () => {
    const history = openAll(["a", "b"]);

    expect(pruneChatHistory(history, new Set(["a", "b"]))).toBe(history);
  });

  it("drops archived chats and keeps the cursor on the chat it was on", () => {
    const history = stepChatHistory(openAll(["a", "b", "c", "d"]), -1).history;

    expect(pruneChatHistory(history, new Set(["b", "c", "d"]))).toEqual({
      entries: ["b", "c", "d"],
      cursor: 1,
    });
    expect(pruneChatHistory(history, new Set(["a", "c", "d"]))).toEqual({
      entries: ["a", "c", "d"],
      cursor: 1,
    });
  });

  it("moves the cursor back to the previous live chat when the current one is gone", () => {
    const history = openAll(["a", "b", "c"]);

    expect(pruneChatHistory(history, new Set(["a", "b"]))).toEqual({
      entries: ["a", "b"],
      cursor: 1,
    });
  });

  it("empties the history when nothing is live", () => {
    expect(pruneChatHistory(openAll(["a", "b"]), new Set())).toEqual({ entries: [], cursor: -1 });
  });

  it("lets forward reach the next chat when every earlier one was pruned", () => {
    const history = stepChatHistory(
      stepChatHistory(openAll(["a", "b", "c"]), -1).history,
      -1,
    ).history;
    const pruned = pruneChatHistory(history, new Set(["b", "c"]));

    expect(pruned).toEqual({ entries: ["b", "c"], cursor: -1 });
    expect(stepChatHistory(pruned, 1).agentId).toBe("b");
  });
});

describe("useWorkspaceChatHistoryStore", () => {
  beforeEach(() => {
    useWorkspaceChatHistoryStore.setState({ historyByWorkspace: {} });
  });

  it("keeps a separate history per workspace", () => {
    const store = useWorkspaceChatHistoryStore.getState();
    store.recordOpen("s:w1", "a");
    store.recordOpen("s:w1", "b");
    store.recordOpen("s:w2", "x");

    expect(store.step("s:w1", -1)).toBe("a");
    expect(store.step("s:w2", -1)).toBeNull();
  });

  it("returns the chat to open and leaves the history alone at the ends", () => {
    const store = useWorkspaceChatHistoryStore.getState();
    store.recordOpen("s:w", "a");
    store.recordOpen("s:w", "b");
    const before = useWorkspaceChatHistoryStore.getState().historyByWorkspace;

    expect(store.step("s:w", 1)).toBeNull();
    expect(useWorkspaceChatHistoryStore.getState().historyByWorkspace).toBe(before);
  });

  it("prunes a workspace's archived chats", () => {
    const store = useWorkspaceChatHistoryStore.getState();
    store.recordOpen("s:w", "a");
    store.recordOpen("s:w", "b");
    store.prune("s:w", new Set(["b"]));

    expect(useWorkspaceChatHistoryStore.getState().historyByWorkspace["s:w"]).toEqual({
      entries: ["b"],
      cursor: 0,
    });
  });
});
