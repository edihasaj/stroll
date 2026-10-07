import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { createTurnFolder } from "./turn-fold";

function timestamp(seed: number): Date {
  return new Date(`2026-01-01T00:00:${seed.toString().padStart(2, "0")}.000Z`);
}

function userMessage(id: string, seed: number): StreamItem {
  return { kind: "user_message", id, text: id, timestamp: timestamp(seed) };
}

function assistantMessage(
  id: string,
  seed: number,
  options: { groupId?: string; turnId?: string } = {},
): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: timestamp(seed),
    ...(options.groupId ? { blockGroupId: options.groupId, blockIndex: 0 } : {}),
    ...(options.turnId ? { turnId: options.turnId } : {}),
  };
}

function toolCall(id: string, seed: number, turnId?: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: timestamp(seed),
    ...(turnId ? { turnId } : {}),
    payload: {
      source: "orchestrator",
      data: {
        toolCallId: id,
        toolName: "Shell",
        arguments: "echo hi",
        result: null,
        status: "completed",
      },
    },
  };
}

function notification(id: string, seed: number, level: "info" | "warning"): StreamItem {
  return {
    kind: "notification",
    sourceType: "notification",
    id,
    timestamp: timestamp(seed),
    level,
    message: id,
  };
}

const NONE = new Set<string>();

function ids(items: StreamItem[]): string[] {
  return items.map((item) => item.id);
}

describe("createTurnFolder", () => {
  it("folds a finished turn's work behind one row and keeps the final answer", () => {
    const fold = createTurnFolder();
    const tail = [
      userMessage("u1", 0),
      toolCall("t1", 1),
      assistantMessage("m1", 2),
      toolCall("t2", 3),
      assistantMessage("final", 10),
    ];

    const result = fold({ tail, head: [], isTurnActive: false, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual(["u1", "turn-fold:t1", "final"]);
    expect(result.tail[1]).toMatchObject({ kind: "turn_fold", durationMs: 10_000, foldedCount: 3 });
  });

  it("keeps every block of a multi-block final answer", () => {
    const fold = createTurnFolder();
    const tail = [
      userMessage("u1", 0),
      toolCall("t1", 1),
      assistantMessage("final:block:0", 5, { groupId: "final" }),
      assistantMessage("final:block:1", 5, { groupId: "final" }),
    ];

    const result = fold({ tail, head: [], isTurnActive: false, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual(["u1", "turn-fold:t1", "final:block:0", "final:block:1"]);
  });

  it("shows the folded rows after the fold row when it is expanded", () => {
    const fold = createTurnFolder();
    const tail = [userMessage("u1", 0), toolCall("t1", 1), assistantMessage("final", 2)];

    const result = fold({
      tail,
      head: [],
      isTurnActive: false,
      expandedFoldIds: new Set(["turn-fold:t1"]),
    });

    expect(ids(result.tail)).toEqual(["u1", "turn-fold:t1", "t1", "final"]);
    expect(result.tail[1]).toMatchObject({ expanded: true });
  });

  it("never folds the running turn", () => {
    const fold = createTurnFolder();
    const tail = [userMessage("u1", 0), toolCall("t1", 1), assistantMessage("m1", 2)];

    const result = fold({ tail, head: [], isTurnActive: true, expandedFoldIds: NONE });

    expect(result.tail).toBe(tail);
  });

  it("folds earlier turns while the latest one runs", () => {
    const fold = createTurnFolder();
    const tail = [
      userMessage("u1", 0),
      toolCall("t1", 1),
      assistantMessage("a1", 2),
      userMessage("u2", 3),
      toolCall("t2", 4),
    ];

    const result = fold({ tail, head: [], isTurnActive: true, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual(["u1", "turn-fold:t1", "a1", "u2", "t2"]);
  });

  it("leaves warnings visible and turns without work untouched", () => {
    const fold = createTurnFolder();
    const tail = [
      userMessage("u1", 0),
      notification("warn", 1, "warning"),
      toolCall("t1", 2),
      assistantMessage("a1", 3),
      userMessage("u2", 4),
      assistantMessage("a2", 5),
    ];

    const result = fold({ tail, head: [], isTurnActive: false, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual(["u1", "warn", "turn-fold:t1", "a1", "u2", "a2"]);
  });

  it("only folds rows of the final answer's canonical turn", () => {
    const fold = createTurnFolder();
    const tail = [
      userMessage("u1", 0),
      toolCall("injected", 1, "turn-a"),
      toolCall("t1", 2, "turn-b"),
      assistantMessage("final", 3, { turnId: "turn-b" }),
    ];

    const result = fold({ tail, head: [], isTurnActive: false, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual(["u1", "injected", "turn-fold:t1", "final"]);
  });

  it("keeps each canonical turn's own answer when a system turn follows in the same response", () => {
    const fold = createTurnFolder();
    const tail = [
      userMessage("u1", 0),
      toolCall("spawn", 1, "turn-a"),
      assistantMessage("agent-id", 2, { turnId: "turn-a" }),
      toolCall("check", 3, "turn-b"),
      assistantMessage("finished", 4, { turnId: "turn-b" }),
    ];

    const result = fold({ tail, head: [], isTurnActive: false, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual([
      "u1",
      "turn-fold:spawn",
      "agent-id",
      "turn-fold:check",
      "finished",
    ]);
    expect(result.tail[1]).toMatchObject({ durationMs: 2_000 });
    expect(result.tail[3]).toMatchObject({ durationMs: null, foldedCount: 1 });
  });

  it("splits a fold across history and the live head by where each row lives", () => {
    const fold = createTurnFolder();
    const tail = [userMessage("u1", 0), toolCall("t1", 1)];
    const head = [toolCall("t2", 2), assistantMessage("final", 3)];

    const result = fold({ tail, head, isTurnActive: false, expandedFoldIds: NONE });

    expect(ids(result.tail)).toEqual(["u1", "turn-fold:t1"]);
    expect(ids(result.head)).toEqual(["final"]);
  });

  it("keeps array and fold-row identity across calls while nothing changed", () => {
    const fold = createTurnFolder();
    const tail = [userMessage("u1", 0), toolCall("t1", 1), assistantMessage("a1", 2)];
    const first = fold({ tail, head: [], isTurnActive: false, expandedFoldIds: NONE });

    const second = fold({
      tail,
      head: [userMessage("u2", 3)],
      isTurnActive: true,
      expandedFoldIds: NONE,
    });

    expect(second.tail).toBe(first.tail);
    expect(second.tail[1]).toBe(first.tail[1]);
  });
});
