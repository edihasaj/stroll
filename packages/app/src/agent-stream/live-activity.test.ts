import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { AgentToolCallStatus, StreamItem } from "@/types/stream";
import { resolveLiveActivity } from "./live-activity";

const AT = new Date("2026-01-01T00:00:00.000Z");

function agentCall(
  detail: ToolCallDetail,
  options: { name?: string; status?: AgentToolCallStatus } = {},
): StreamItem {
  return {
    kind: "tool_call",
    id: "call",
    timestamp: AT,
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: "call",
        name: options.name ?? "tool",
        status: options.status ?? "running",
        error: null,
        detail,
      },
    },
  };
}

const UNKNOWN: ToolCallDetail = { type: "unknown", input: null, output: null };

describe("resolveLiveActivity", () => {
  it("names a running command by its first line", () => {
    expect(
      resolveLiveActivity([agentCall({ type: "shell", command: "npm test\n  --watch=false" })]),
    ).toEqual({ kind: "running", command: "npm test" });
  });

  it("shortens a long command", () => {
    const activity = resolveLiveActivity([
      agentCall({ type: "shell", command: `echo ${"x".repeat(100)}` }),
    ]);
    expect(activity).toMatchObject({ kind: "running" });
    expect(activity?.kind === "running" && activity.command.length).toBe(60);
  });

  it("names reads and edits by file name", () => {
    expect(
      resolveLiveActivity([agentCall({ type: "read", filePath: "/repo/src/app.ts" })]),
    ).toEqual({ kind: "reading", file: "app.ts" });
    expect(
      resolveLiveActivity([agentCall({ type: "write", filePath: "C:\\repo\\notes.md" })]),
    ).toEqual({ kind: "editing", file: "notes.md" });
  });

  it("names searches, fetches, and subagent spawns", () => {
    expect(resolveLiveActivity([agentCall({ type: "search", query: " useMemo " })])).toEqual({
      kind: "searching",
      query: "useMemo",
    });
    expect(
      resolveLiveActivity([agentCall({ type: "fetch", url: "https://docs.example.com/a?b" })]),
    ).toEqual({ kind: "fetching", host: "docs.example.com" });
    expect(resolveLiveActivity([agentCall(UNKNOWN, { name: "mcp__paseo__create_agent" })])).toEqual(
      { kind: "subagent" },
    );
  });

  it("falls back to the tool name for other tools", () => {
    expect(resolveLiveActivity([agentCall(UNKNOWN, { name: "mcp__linear__get_issue" })])).toEqual({
      kind: "tool",
      name: "mcp__linear__get_issue",
    });
  });

  it("reports thinking while a thought is the newest item", () => {
    expect(
      resolveLiveActivity([
        { kind: "thought", id: "t", text: "hmm", timestamp: AT, status: "loading" },
      ]),
    ).toEqual({ kind: "thinking" });
  });

  it("has nothing to name for answer text or a finished call", () => {
    expect(
      resolveLiveActivity([{ kind: "assistant_message", id: "a", text: "Done", timestamp: AT }]),
    ).toBeNull();
    expect(
      resolveLiveActivity([agentCall({ type: "read", filePath: "a.ts" }, { status: "completed" })]),
    ).toBeNull();
    expect(resolveLiveActivity([])).toBeNull();
  });
});
