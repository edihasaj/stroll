import { describe, expect, it } from "vitest";
import { buildChatSummary } from "./chat-summary-model";
import type { SubagentRow } from "./select";

function row(
  id: string,
  status: "running" | "idle" | "error" | "closed",
  requiresAttention = false,
) {
  return {
    kind: "paseo",
    id,
    provider: "claude",
    title: id,
    description: null,
    subtitle: null,
    status,
    turn:
      status === "running"
        ? { phase: "open", turnId: null, startedAt: null, cancellationRequestId: null }
        : { phase: "idle", cancellationRequestId: null },
    requiresAttention,
    createdAt: new Date(0),
    lastTurn: null,
  } as SubagentRow;
}

describe("buildChatSummary", () => {
  it("has nothing to show for a chat without subagents", () => {
    expect(buildChatSummary([])).toBeNull();
  });

  it("counts working, done, and the ones waiting on the user", () => {
    expect(
      buildChatSummary([
        row("a", "running"),
        row("b", "idle"),
        row("c", "idle"),
        row("d", "running", true),
        row("e", "closed"),
      ]),
    ).toEqual({ needsYou: 1, working: 1, done: 3 });
  });
});
