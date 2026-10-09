import { describe, expect, it } from "vitest";
import type { ChatHistory } from "@/stores/workspace-chat-history-store";
import { orderMainChatCandidates } from "@/workspace-tabs/main-chat-fallback";

function history(
  agentIds: string[],
  workspaceId = "ws",
  cursor = agentIds.length - 1,
): ChatHistory {
  return {
    entries: agentIds.map((agentId) => ({ serverId: "srv", workspaceId, agentId })),
    cursor,
  };
}

const activity: Record<string, number> = { a: 10, b: 30, c: 20, d: 5 };
const lastActivityAt = (agentId: string) => activity[agentId] ?? 0;

function order(input: { history: ChatHistory; candidates: string[] }) {
  return orderMainChatCandidates({
    history: input.history,
    serverId: "srv",
    workspaceId: "ws",
    candidateAgentIds: new Set(input.candidates),
    lastActivityAt,
  });
}

describe("orderMainChatCandidates", () => {
  it("prefers the chat opened before the one that went away", () => {
    // The history ends on `d`, which was archived and is no longer a candidate.
    expect(order({ history: history(["a", "c", "d"]), candidates: ["a", "b", "c"] })).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("skips history entries from another workspace", () => {
    const mixed: ChatHistory = {
      entries: [
        { serverId: "srv", workspaceId: "ws", agentId: "a" },
        { serverId: "srv", workspaceId: "other", agentId: "c" },
      ],
      cursor: 1,
    };
    expect(order({ history: mixed, candidates: ["a", "c"] })).toEqual(["a", "c"]);
  });

  it("ignores entries ahead of the cursor", () => {
    expect(order({ history: history(["a", "c"], "ws", 0), candidates: ["a", "c"] })).toEqual([
      "a",
      "c",
    ]);
  });

  it("falls back to the most recently active chat without history", () => {
    expect(
      order({ history: { entries: [], cursor: -1 }, candidates: ["a", "b", "c", "d"] }),
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("returns nothing when the workspace has no live chat", () => {
    expect(order({ history: history(["a"]), candidates: [] })).toEqual([]);
  });
});
