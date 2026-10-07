import { describe, expect, it } from "vitest";
import { buildChatSummary, resolveRemoteHostSummaryLabel } from "./chat-summary-model";
import type { SubagentRow } from "./select";

const SERVER_ID = "server-1";

function row(
  id: string,
  status: "running" | "idle" | "error" | "closed",
  requiresAttention = false,
  hostServerId: string = SERVER_ID,
) {
  return {
    kind: "paseo",
    id,
    hostServerId,
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

describe("resolveRemoteHostSummaryLabel", () => {
  const hostNames = new Map([["server-2", "MacBook"]]);

  it("returns null when every row is on the parent's own host", () => {
    expect(
      resolveRemoteHostSummaryLabel([row("a", "idle"), row("b", "running")], SERVER_ID, hostNames),
    ).toBeNull();
  });

  it("names the one remote host shared by every remote row", () => {
    expect(
      resolveRemoteHostSummaryLabel(
        [row("a", "idle"), row("b", "running", false, "server-2")],
        SERVER_ID,
        hostNames,
      ),
    ).toBe("MacBook");
  });

  it("lists every distinct remote host once, regardless of how many rows are on it", () => {
    expect(
      resolveRemoteHostSummaryLabel(
        [
          row("a", "idle", false, "server-2"),
          row("b", "running", false, "server-2"),
          row("c", "idle", false, "server-3"),
        ],
        SERVER_ID,
        hostNames,
      ),
    ).toBe("MacBook, server-3");
  });
});
