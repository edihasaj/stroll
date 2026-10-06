import { describe, expect, it } from "vitest";
import {
  extractCreatedAgentId,
  resolveNativeProviderSubagentId,
  resolveSubagentToolCallLink,
} from "./tool-call-link";

describe("extractCreatedAgentId", () => {
  it("reads the agent id out of a structuredContent envelope", () => {
    expect(
      extractCreatedAgentId("mcp__paseo__create_agent", {
        structuredContent: { agentId: "agent-123", status: "running" },
      }),
    ).toBe("agent-123");
  });

  it("reads the agent id out of a single JSON text content block", () => {
    expect(
      extractCreatedAgentId("mcp__paseo__create_agent", {
        content: [{ type: "text", text: JSON.stringify({ agentId: "agent-456" }) }],
      }),
    ).toBe("agent-456");
  });

  it("reads the agent id out of Claude's plain-text result: summary lines, a blank line, then JSON", () => {
    const text = [
      "availableModes_count=2",
      "availableModes_ids=load-test,approval-test",
      "",
      JSON.stringify({ agentId: "agent-text", status: "running" }, null, 2),
    ].join("\n");

    expect(extractCreatedAgentId("mcp__paseo__create_agent", text)).toBe("agent-text");
  });

  it("reads the agent id out of the Claude provider's `{ output }` wrapper", () => {
    const text = ["availableModes_count=1", "", JSON.stringify({ agentId: "agent-wrapped" })].join(
      "\n",
    );

    expect(extractCreatedAgentId("mcp__paseo__create_agent", { output: text })).toBe(
      "agent-wrapped",
    );
    expect(
      extractCreatedAgentId("mcp__paseo__create_agent", { output: { agentId: "agent-parsed" } }),
    ).toBe("agent-parsed");
  });

  it("reads the agent id out of a plain JSON string result", () => {
    expect(
      extractCreatedAgentId("mcp__paseo__create_agent", JSON.stringify({ agentId: "agent-json" })),
    ).toBe("agent-json");
  });

  it("returns null for a plain-text result that carries no JSON", () => {
    expect(extractCreatedAgentId("mcp__paseo__create_agent", "Agent creation failed")).toBeNull();
  });

  it("recognizes the dotted paseo tool name form", () => {
    expect(
      extractCreatedAgentId("paseo.create_agent", { structuredContent: { agentId: "agent-789" } }),
    ).toBe("agent-789");
  });

  it("returns null for a tool call that is not create_agent", () => {
    expect(
      extractCreatedAgentId("mcp__paseo__list_agents", {
        structuredContent: { agentId: "agent-123" },
      }),
    ).toBeNull();
  });

  it("returns null for a non-paseo tool that happens to be named create_agent", () => {
    expect(
      extractCreatedAgentId("create_agent", { structuredContent: { agentId: "agent-123" } }),
    ).toBeNull();
  });

  it("returns null while the call is still running and has no result yet", () => {
    expect(extractCreatedAgentId("mcp__paseo__create_agent", null)).toBeNull();
  });

  it("returns null when the result has no agentId", () => {
    expect(
      extractCreatedAgentId("mcp__paseo__create_agent", { structuredContent: { status: "error" } }),
    ).toBeNull();
  });
});

describe("resolveNativeProviderSubagentId", () => {
  it("uses the tool call's own id for claude", () => {
    expect(
      resolveNativeProviderSubagentId({
        provider: "claude",
        toolCallId: "toolu_01abc",
        childSessionId: null,
      }),
    ).toBe("toolu_01abc");
  });

  it("uses childSessionId for opencode", () => {
    expect(
      resolveNativeProviderSubagentId({
        provider: "opencode",
        toolCallId: "call_1",
        childSessionId: "ses_child_1",
      }),
    ).toBe("ses_child_1");
  });

  it("has no mapping for codex — the descriptor id never reaches the client", () => {
    expect(
      resolveNativeProviderSubagentId({
        provider: "codex",
        toolCallId: "call_1",
        childSessionId: null,
      }),
    ).toBeNull();
  });

  it("has no mapping for omp — childSessionId is a session file path, not the descriptor id", () => {
    expect(
      resolveNativeProviderSubagentId({
        provider: "omp",
        toolCallId: "call_1",
        childSessionId: "/tmp/omp-session.jsonl",
      }),
    ).toBeNull();
  });

  it("has no mapping for an unrecognized provider", () => {
    expect(
      resolveNativeProviderSubagentId({
        provider: "pi",
        toolCallId: "call_1",
        childSessionId: null,
      }),
    ).toBeNull();
  });

  it("treats an empty claude call id as missing", () => {
    expect(
      resolveNativeProviderSubagentId({ provider: "claude", toolCallId: "", childSessionId: null }),
    ).toBeNull();
  });

  it("treats a missing opencode childSessionId as unmapped", () => {
    expect(
      resolveNativeProviderSubagentId({
        provider: "opencode",
        toolCallId: "call_1",
        childSessionId: null,
      }),
    ).toBeNull();
  });
});

describe("resolveSubagentToolCallLink", () => {
  it("links a claude sub_agent detail to its own call id", () => {
    expect(
      resolveSubagentToolCallLink({
        toolName: "Task",
        provider: "claude",
        callId: "toolu_01abc",
        detail: { type: "sub_agent", subAgentType: "general-purpose", log: "" },
      }),
    ).toEqual({ kind: "native", provider: "claude", mappedSubagentId: "toolu_01abc" });
  });

  it("links an opencode sub_agent detail to its childSessionId", () => {
    expect(
      resolveSubagentToolCallLink({
        toolName: "task",
        provider: "opencode",
        callId: "call_1",
        detail: { type: "sub_agent", log: "", childSessionId: "ses_child_1" },
      }),
    ).toEqual({ kind: "native", provider: "opencode", mappedSubagentId: "ses_child_1" });
  });

  it("reports a codex sub_agent detail as native but unmapped", () => {
    expect(
      resolveSubagentToolCallLink({
        toolName: "spawnAgent",
        provider: "codex",
        callId: "call_1",
        detail: { type: "sub_agent", log: "" },
      }),
    ).toEqual({ kind: "native", provider: "codex", mappedSubagentId: null });
  });

  it("links a create_agent call to the managed agent id in its result", () => {
    expect(
      resolveSubagentToolCallLink({
        toolName: "mcp__paseo__create_agent",
        detail: {
          type: "unknown",
          input: {},
          output: { structuredContent: { agentId: "agent-1" } },
        },
      }),
    ).toEqual({ kind: "managed", agentId: "agent-1" });
  });

  it("returns null for a create_agent call with no result yet", () => {
    expect(
      resolveSubagentToolCallLink({
        toolName: "mcp__paseo__create_agent",
        detail: { type: "unknown", input: {}, output: null },
      }),
    ).toBeNull();
  });

  it("returns null for an unrelated tool call", () => {
    expect(
      resolveSubagentToolCallLink({
        toolName: "Bash",
        detail: { type: "shell", command: "ls" },
      }),
    ).toBeNull();
  });

  it("returns null when there is no detail at all", () => {
    expect(resolveSubagentToolCallLink({ toolName: "Bash", detail: undefined })).toBeNull();
  });
});
