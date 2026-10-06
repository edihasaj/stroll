import { describe, expect, it } from "vitest";
import type { AgentBrief } from "@getpaseo/protocol/agent-route";
import type { AgentTimelineFetchResult } from "../agent-timeline-store-types.js";
import type { ProjectedTimelineRow } from "../timeline-projection.js";
import type {
  AgentTimelineItem,
  ToolCallDetail,
  ToolCallTimelineItem,
} from "../agent-sdk-types.js";
import type {
  GitCommandOptions,
  GitCommandResult,
  RunGitCommand,
} from "../../../utils/run-git-command.js";
import {
  collectHandoffInput,
  formatHandoffPacket,
  type HandoffToolCall,
} from "./handoff-packet.js";

function buildBrief(overrides: Partial<AgentBrief> = {}): AgentBrief {
  return {
    threadId: "thread-1",
    goal: "Ship the feature",
    state: "Implementing the handoff packet",
    decisions: ["Use the existing git helper"],
    openItems: ["Write tests"],
    files: ["handoff-packet.ts"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildToolCall(name: string, overrides: Partial<HandoffToolCall> = {}): HandoffToolCall {
  return { name, args: "", status: "completed", output: "", ...overrides };
}

describe("formatHandoffPacket", () => {
  const baseInput = {
    fromLabel: "Qwen (Spark)",
    reason: "unreachable" as const,
    brief: buildBrief(),
    originalRequest: "Add the brief service",
    latestUserMessage: "Please keep going",
    toolCalls: [buildToolCall("bash", { args: "npm test", status: "failed", output: "2 failing" })],
    git: { statusShort: " M file.ts", diffStat: "file.ts | 1 +" },
  };

  it("wraps the packet in a handoff element with from and reason", () => {
    const packet = formatHandoffPacket(baseInput);
    expect(packet.startsWith('<handoff from="Qwen (Spark)" reason="unreachable">\n')).toBe(true);
    expect(packet.endsWith("\n</handoff>")).toBe(true);
  });

  it("includes the intro line and every section in order", () => {
    const packet = formatHandoffPacket(baseInput);
    const introIndex = packet.indexOf("This work continues from another model");
    const briefIndex = packet.indexOf("## Brief");
    const requestIndex = packet.indexOf("## Original request");
    const latestIndex = packet.indexOf("## Latest user message");
    const toolCallsIndex = packet.indexOf("## Last tool calls");
    const workspaceIndex = packet.indexOf("## Workspace");

    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(briefIndex).toBeGreaterThan(introIndex);
    expect(requestIndex).toBeGreaterThan(briefIndex);
    expect(latestIndex).toBeGreaterThan(requestIndex);
    expect(toolCallsIndex).toBeGreaterThan(latestIndex);
    expect(workspaceIndex).toBeGreaterThan(toolCallsIndex);
  });

  it("renders brief fields, including bulleted decisions and open items", () => {
    const packet = formatHandoffPacket(baseInput);
    expect(packet).toContain("Goal: Ship the feature");
    expect(packet).toContain("State: Implementing the handoff packet");
    expect(packet).toContain("Decisions:\n- Use the existing git helper");
    expect(packet).toContain("Open items:\n- Write tests");
    expect(packet).toContain("Files: handoff-packet.ts");
  });

  it("falls back to an explicit placeholder when there is no brief yet", () => {
    const packet = formatHandoffPacket({ ...baseInput, brief: null });
    expect(packet).toContain("## Brief\n(no brief recorded yet)");
  });

  it("marks empty decisions, open items, and files as none", () => {
    const packet = formatHandoffPacket({
      ...baseInput,
      brief: buildBrief({ decisions: [], openItems: [], files: [] }),
    });
    expect(packet).toContain("Decisions:\n(none)");
    expect(packet).toContain("Open items:\n(none)");
    expect(packet).toContain("Files: (none)");
  });

  it("falls back to none for a blank original request or latest user message", () => {
    const packet = formatHandoffPacket({
      ...baseInput,
      originalRequest: "  ",
      latestUserMessage: "",
    });
    expect(packet).toContain("## Original request\n(none)");
    expect(packet).toContain("## Latest user message\n(none)");
  });

  it("numbers tool calls and renders status plus trimmed output", () => {
    const packet = formatHandoffPacket({
      ...baseInput,
      toolCalls: [
        buildToolCall("bash", { args: "npm test", status: "failed", output: "2 failing" }),
        buildToolCall("read", { args: "src/index.ts", status: "completed", output: "" }),
      ],
    });
    expect(packet).toContain("1. bash: npm test — failed. Output (trimmed): 2 failing");
    expect(packet).toContain("2. read: src/index.ts — completed. Output (trimmed): (none)");
  });

  it("renders a placeholder when there are no tool calls", () => {
    const packet = formatHandoffPacket({ ...baseInput, toolCalls: [] });
    expect(packet).toContain("## Last tool calls\n(no tool calls recorded)");
  });

  it("omits the workspace section entirely when git is null", () => {
    const packet = formatHandoffPacket({ ...baseInput, git: null });
    expect(packet).not.toContain("## Workspace");
    expect(packet).not.toContain("git status --short");
  });

  it("renders the workspace section when git is present", () => {
    const packet = formatHandoffPacket(baseInput);
    // The leading status-code space from `git status --short` is kept: " M" (unstaged) and "M "
    // (staged) mean different things.
    expect(packet).toContain(
      "## Workspace\ngit status --short:\n M file.ts\ngit diff --stat:\nfile.ts | 1 +",
    );
  });

  it("escapes double quotes in the from label", () => {
    const packet = formatHandoffPacket({ ...baseInput, fromLabel: 'Codex "personal"' });
    expect(
      packet.startsWith('<handoff from="Codex &quot;personal&quot;" reason="unreachable">'),
    ).toBe(true);
  });
});

function buildFetchResult(items: AgentTimelineItem[]): AgentTimelineFetchResult {
  const rows: ProjectedTimelineRow[] = items.map((item, index) => ({
    seq: index + 1,
    timestamp: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    item,
    seqStart: index + 1,
    seqEnd: index + 1,
  }));
  return {
    epoch: "epoch-1",
    direction: "tail",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: 0, maxSeq: rows.length, nextSeq: rows.length + 1 },
    hasOlder: false,
    hasNewer: false,
    startSeq: rows.length > 0 ? rows[0]!.seq : null,
    endSeq: rows.length > 0 ? rows[rows.length - 1]!.seq : null,
    rows,
  };
}

function userMessage(text: string): AgentTimelineItem {
  return { type: "user_message", text };
}

function toolCallItem(
  overrides: {
    callId?: string;
    name?: string;
    status?: "running" | "completed" | "failed" | "canceled";
    error?: unknown;
    detail?: ToolCallDetail;
  } = {},
): ToolCallTimelineItem {
  const status = overrides.status ?? "completed";
  const base = {
    type: "tool_call" as const,
    callId: overrides.callId ?? "call-1",
    name: overrides.name ?? "bash",
    detail:
      overrides.detail ??
      ({ type: "shell", command: "npm test", output: "ok" } satisfies ToolCallDetail),
  };
  if (status === "failed") {
    return { ...base, status, error: overrides.error ?? "boom" };
  }
  return { ...base, status, error: null };
}

function createFakeRunGit(options: { isRepo: boolean; status?: string; diffStat?: string }): {
  runGit: RunGitCommand;
  calls: Array<{ args: string[]; options: GitCommandOptions }>;
} {
  const calls: Array<{ args: string[]; options: GitCommandOptions }> = [];
  const baseResult = (stdout: string): GitCommandResult => ({
    stdout,
    stderr: "",
    truncated: false,
    exitCode: 0,
    signal: null,
  });
  const runGit: RunGitCommand = async (args, callOptions) => {
    calls.push({ args, options: callOptions });
    if (args[0] === "rev-parse") {
      return { ...baseResult(""), exitCode: options.isRepo ? 0 : 128 };
    }
    if (args[0] === "status") {
      return baseResult(options.status ?? "");
    }
    if (args[0] === "diff") {
      return baseResult(options.diffStat ?? "");
    }
    throw new Error(`Unexpected git args: ${args.join(" ")}`);
  };
  return { runGit, calls };
}

describe("collectHandoffInput", () => {
  it("reads the original request from the thread's first agent", async () => {
    const threadTimeline = buildFetchResult([
      userMessage("Original ask"),
      userMessage("A later message on the same agent"),
    ]);
    const agentTimeline = buildFetchResult([userMessage("Latest from the failing agent")]);
    const { runGit } = createFakeRunGit({ isRepo: false });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief: null, events: [] }) },
        readTimeline: async (agentId) =>
          (agentId === "thread-1" ? threadTimeline : agentTimeline).rows,
        runGit,
      },
      { agentId: "agent-2", threadId: "thread-1", agentCwd: "/tmp/project" },
    );

    expect(result.originalRequest).toBe("Original ask");
    expect(result.latestUserMessage).toBe("Latest from the failing agent");
  });

  it("takes the brief from the store", async () => {
    const brief = buildBrief();
    const { runGit } = createFakeRunGit({ isRepo: false });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief, events: [] }) },
        readTimeline: async () => buildFetchResult([]).rows,
        runGit,
      },
      { agentId: "agent-1", threadId: "agent-1", agentCwd: "/tmp/project" },
    );

    expect(result.brief).toEqual(brief);
  });

  it("keeps only the last five tool calls, oldest first, with args and output trimmed to 600 chars", async () => {
    const longOutput = "x".repeat(650);
    const items: AgentTimelineItem[] = Array.from({ length: 7 }, (_, index) =>
      toolCallItem({
        callId: `call-${index}`,
        name: `tool-${index}`,
        detail: { type: "shell", command: `cmd-${index}`, output: index === 6 ? longOutput : "ok" },
      }),
    );
    const { runGit } = createFakeRunGit({ isRepo: false });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief: null, events: [] }) },
        readTimeline: async () => buildFetchResult(items).rows,
        runGit,
      },
      { agentId: "agent-1", threadId: "agent-1", agentCwd: "/tmp/project" },
    );

    expect(result.toolCalls).toHaveLength(5);
    expect(result.toolCalls.map((call) => call.name)).toEqual([
      "tool-2",
      "tool-3",
      "tool-4",
      "tool-5",
      "tool-6",
    ]);
    const last = result.toolCalls[4]!;
    expect(last.output.endsWith("…")).toBe(true);
    expect(last.output.length).toBe(601);
  });

  it("appends the error to the output for a failed tool call", async () => {
    const items: AgentTimelineItem[] = [
      toolCallItem({
        status: "failed",
        error: "exit code 1",
        detail: { type: "shell", command: "npm test", output: "2 failing" },
      }),
    ];
    const { runGit } = createFakeRunGit({ isRepo: false });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief: null, events: [] }) },
        readTimeline: async () => buildFetchResult(items).rows,
        runGit,
      },
      { agentId: "agent-1", threadId: "agent-1", agentCwd: "/tmp/project" },
    );

    expect(result.toolCalls[0]!.status).toBe("failed");
    expect(result.toolCalls[0]!.output).toBe("2 failing\nexit code 1");
  });

  it("describes an unknown-detail tool call from its JSON input and output", async () => {
    const items: AgentTimelineItem[] = [
      toolCallItem({
        name: "custom_tool",
        detail: { type: "unknown", input: { query: "find bugs" }, output: { count: 3 } },
      }),
    ];
    const { runGit } = createFakeRunGit({ isRepo: false });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief: null, events: [] }) },
        readTimeline: async () => buildFetchResult(items).rows,
        runGit,
      },
      { agentId: "agent-1", threadId: "agent-1", agentCwd: "/tmp/project" },
    );

    expect(result.toolCalls[0]).toMatchObject({
      name: "custom_tool",
      args: '{"query":"find bugs"}',
      output: '{"count":3}',
    });
  });

  it("skips the git section when the directory is not a repository", async () => {
    const { runGit, calls } = createFakeRunGit({ isRepo: false });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief: null, events: [] }) },
        readTimeline: async () => buildFetchResult([]).rows,
        runGit,
      },
      { agentId: "agent-1", threadId: "agent-1", agentCwd: "/tmp/project" },
    );

    expect(result.git).toBeNull();
    expect(calls.map((call) => call.args[0])).toEqual(["rev-parse"]);
  });

  it("collects git status --short and git diff --stat with a timeout when it is a repository", async () => {
    const { runGit, calls } = createFakeRunGit({
      isRepo: true,
      status: " M file.ts",
      diffStat: "file.ts | 1 +",
    });

    const result = await collectHandoffInput(
      {
        briefStore: { read: async () => ({ brief: null, events: [] }) },
        readTimeline: async () => buildFetchResult([]).rows,
        runGit,
      },
      { agentId: "agent-1", threadId: "agent-1", agentCwd: "/tmp/project" },
    );

    expect(result.git).toEqual({ statusShort: " M file.ts", diffStat: "file.ts | 1 +" });
    expect(calls.map((call) => call.args[0])).toEqual(["rev-parse", "status", "diff"]);
    for (const call of calls) {
      expect(call.options.timeout).toBeGreaterThan(0);
      expect(call.options.cwd).toBe("/tmp/project");
    }
  });
});
