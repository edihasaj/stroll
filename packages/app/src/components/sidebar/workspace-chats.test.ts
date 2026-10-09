import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import {
  aggregateChatBucket,
  areSidebarChatsEqual,
  buildWorkspaceChatIndex,
  limitSidebarChats,
  SIDEBAR_CHAT_LIMIT,
  type SidebarChat,
} from "./workspace-chats";

function makeAgent(input: Partial<Agent> & Pick<Agent, "id">): Agent {
  return {
    serverId: "server",
    provider: "codex",
    status: "idle",
    turn: { phase: "idle", cancellationRequestId: null },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastUserMessageAt: null,
    lastActivityAt: new Date(0),
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: false,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    cwd: "/repo",
    workspaceId: "w1",
    model: null,
    parentAgentId: null,
    labels: {},
    ...input,
  };
}

function indexOf(agents: Agent[]) {
  return buildWorkspaceChatIndex(new Map(agents.map((agent) => [agent.id, agent])));
}

function chat(id: string, overrides: Partial<SidebarChat> = {}): SidebarChat {
  return {
    id,
    title: id,
    provider: "codex",
    bucket: "done",
    lastActivityAt: 0,
    ...overrides,
  };
}

describe("buildWorkspaceChatIndex", () => {
  it("lists a workspace's chats most recently active first", () => {
    const index = indexOf([
      makeAgent({ id: "old", lastActivityAt: new Date(1_000) }),
      makeAgent({ id: "new", lastActivityAt: new Date(3_000) }),
      makeAgent({ id: "mid", lastActivityAt: new Date(2_000) }),
    ]);

    expect(index.get("w1")?.map((entry) => entry.id)).toEqual(["new", "mid", "old"]);
  });

  it("keeps each workspace's chats apart", () => {
    const index = indexOf([
      makeAgent({ id: "a", workspaceId: "w1" }),
      makeAgent({ id: "b", workspaceId: "w2" }),
    ]);

    expect(index.get("w1")?.map((entry) => entry.id)).toEqual(["a"]);
    expect(index.get("w2")?.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("leaves out archived chats and agents with no workspace", () => {
    const index = indexOf([
      makeAgent({ id: "live" }),
      makeAgent({ id: "archived", archivedAt: new Date(5) }),
      makeAgent({ id: "orphan", workspaceId: undefined }),
    ]);

    expect(index.get("w1")?.map((entry) => entry.id)).toEqual(["live"]);
    expect(index.size).toBe(1);
  });

  it("leaves out subagents of the same workspace but lists a cross-workspace subagent", () => {
    const index = indexOf([
      makeAgent({ id: "parent" }),
      makeAgent({ id: "child", parentAgentId: "parent" }),
      makeAgent({ id: "away", parentAgentId: "parent", workspaceId: "w2" }),
    ]);

    expect(index.get("w1")?.map((entry) => entry.id)).toEqual(["parent"]);
    expect(index.get("w2")?.map((entry) => entry.id)).toEqual(["away"]);
  });

  it("breaks activity ties by id so the order is stable", () => {
    const index = indexOf([makeAgent({ id: "b" }), makeAgent({ id: "a" })]);

    expect(index.get("w1")?.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("derives the status bucket the workspace rows use", () => {
    const index = indexOf([
      makeAgent({
        id: "running",
        turn: { phase: "open", cancellationRequestId: null } as Agent["turn"],
        status: "running",
      }),
      makeAgent({
        id: "failed",
        status: "error",
        requiresAttention: true,
        attentionReason: "error",
      }),
      makeAgent({ id: "finished", requiresAttention: true, attentionReason: "finished" }),
      makeAgent({ id: "idle" }),
    ]);
    const buckets = Object.fromEntries(
      (index.get("w1") ?? []).map((entry) => [entry.id, entry.bucket]),
    );

    expect(buckets).toEqual({
      running: "running",
      failed: "failed",
      finished: "attention",
      idle: "done",
    });
  });

  it("treats a placeholder title as no title", () => {
    const index = indexOf([
      makeAgent({ id: "placeholder", title: "New agent" }),
      makeAgent({ id: "named", title: " Fix login " }),
    ]);
    const titles = Object.fromEntries(
      (index.get("w1") ?? []).map((entry) => [entry.id, entry.title]),
    );

    expect(titles).toEqual({ named: "Fix login", placeholder: null });
  });
});

describe("limitSidebarChats", () => {
  const chats = Array.from({ length: 8 }, (_, index) => chat(`c${index}`));

  it("shows the first few chats with a toggle when there are more", () => {
    const limited = limitSidebarChats({ chats, expanded: false, activeChatId: null });

    expect(limited.visible.map((entry) => entry.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(limited.visible).toHaveLength(SIDEBAR_CHAT_LIMIT);
    expect(limited.canToggle).toBe(true);
  });

  it("shows every chat once expanded", () => {
    const limited = limitSidebarChats({ chats, expanded: true, activeChatId: null });

    expect(limited.visible).toHaveLength(8);
    expect(limited.canToggle).toBe(true);
  });

  it("has no toggle at or under the limit", () => {
    const few = chats.slice(0, SIDEBAR_CHAT_LIMIT);
    const limited = limitSidebarChats({ chats: few, expanded: false, activeChatId: null });

    expect(limited).toEqual({ visible: few, canToggle: false });
  });

  it("keeps the active chat visible by giving it the last slot", () => {
    const limited = limitSidebarChats({ chats, expanded: false, activeChatId: "c6" });

    expect(limited.visible.map((entry) => entry.id)).toEqual(["c0", "c1", "c2", "c3", "c6"]);
  });

  it("does not move an active chat that is already visible", () => {
    const limited = limitSidebarChats({ chats, expanded: false, activeChatId: "c2" });

    expect(limited.visible.map((entry) => entry.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });
});

describe("areSidebarChatsEqual", () => {
  it("compares chats by value", () => {
    expect(areSidebarChatsEqual([chat("a")], [chat("a")])).toBe(true);
    expect(areSidebarChatsEqual([chat("a")], [chat("a", { title: "renamed" })])).toBe(false);
    expect(areSidebarChatsEqual([chat("a")], [chat("a", { bucket: "running" })])).toBe(false);
    expect(areSidebarChatsEqual([chat("a")], [chat("a"), chat("b")])).toBe(false);
  });
});

describe("aggregateChatBucket", () => {
  it("surfaces the most urgent chat status", () => {
    expect(
      aggregateChatBucket([
        chat("a"),
        chat("b", { bucket: "running" }),
        chat("c", { bucket: "failed" }),
      ]),
    ).toBe("failed");
    expect(aggregateChatBucket([chat("a")])).toBe("done");
    expect(aggregateChatBucket([])).toBe("done");
  });
});
