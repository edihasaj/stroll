import type { AgentBrief, AgentRouteFailureReason } from "@getpaseo/protocol/agent-route";
import type { AgentManager } from "../agent-manager.js";
import type { ToolCallDetail, ToolCallTimelineItem } from "../agent-sdk-types.js";
import type { ProjectedTimelineRow } from "../timeline-projection.js";
import type { RunGitCommand } from "../../../utils/run-git-command.js";
import type { AgentBriefStore } from "./brief-store.js";

/** docs/agent-routes.md: "the last five tool calls, with arguments and output trimmed to 600
 * characters each". */
const MAX_TOOL_CALLS = 5;
const MAX_FIELD_CHARS = 600;
const GIT_COMMAND_TIMEOUT_MS = 5_000;

export interface HandoffToolCall {
  name: string;
  args: string;
  status: string;
  output: string;
}

export interface HandoffGitSummary {
  statusShort: string;
  diffStat: string;
}

export interface HandoffPacketInput {
  /** Display name of the profile the work comes from, e.g. "Qwen (Spark)". */
  fromLabel: string;
  reason: AgentRouteFailureReason;
  brief: AgentBrief | null;
  originalRequest: string;
  latestUserMessage: string;
  /** Oldest first; at most the last five, per docs/agent-routes.md. */
  toolCalls: readonly HandoffToolCall[];
  /** Null when the agent's directory is not a git repository. */
  git: HandoffGitSummary | null;
}

const HANDOFF_INTRO =
  "This work continues from another model. Pick up where it left off; do not redo finished steps.";

/**
 * Formats the handoff packet exactly per docs/agent-routes.md ("The brief and the handoff
 * packet"). Pure: every input is already collected by `collectHandoffInput`.
 */
export function formatHandoffPacket(input: HandoffPacketInput): string {
  const body = [
    HANDOFF_INTRO,
    "",
    formatBriefSection(input.brief),
    "",
    "## Original request",
    formatBodyText(input.originalRequest),
    "",
    "## Latest user message",
    formatBodyText(input.latestUserMessage),
    "",
    "## Last tool calls",
    formatToolCallsSection(input.toolCalls),
    ...(input.git ? ["", "## Workspace", formatGitSection(input.git)] : []),
  ].join("\n");
  return `<handoff from="${escapeAttribute(input.fromLabel)}" reason="${input.reason}">\n${body}\n</handoff>`;
}

function formatBriefSection(brief: AgentBrief | null): string {
  if (!brief) {
    return ["## Brief", "(no brief recorded yet)"].join("\n");
  }
  return [
    "## Brief",
    `Goal: ${brief.goal}`,
    `State: ${brief.state}`,
    ...formatBulletField("Decisions", brief.decisions),
    ...formatBulletField("Open items", brief.openItems),
    `Files: ${brief.files.length > 0 ? brief.files.join(", ") : "(none)"}`,
  ].join("\n");
}

function formatBulletField(label: string, items: readonly string[]): string[] {
  if (items.length === 0) {
    return [`${label}:`, "(none)"];
  }
  return [`${label}:`, ...items.map((item) => `- ${item}`)];
}

function formatBodyText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : "(none)";
}

function formatToolCallsSection(toolCalls: readonly HandoffToolCall[]): string {
  if (toolCalls.length === 0) {
    return "(no tool calls recorded)";
  }
  return toolCalls
    .map((call, index) => {
      const args = call.args.trim();
      const head = args.length > 0 ? `${call.name}: ${args}` : call.name;
      const output = call.output.trim().length > 0 ? call.output.trim() : "(none)";
      return `${index + 1}. ${head} — ${call.status}. Output (trimmed): ${output}`;
    })
    .join("\n");
}

function formatGitSection(git: HandoffGitSummary): string {
  return [
    "git status --short:",
    git.statusShort.trim().length > 0 ? git.statusShort.trim() : "(clean)",
    "git diff --stat:",
    git.diffStat.trim().length > 0 ? git.diffStat.trim() : "(no diff)",
  ].join("\n");
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function trimToChars(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function findFirstUserMessageText(rows: readonly ProjectedTimelineRow[]): string {
  for (const row of rows) {
    if (row.item.type === "user_message") {
      return row.item.text.trim();
    }
  }
  return "";
}

function findLastUserMessageText(rows: readonly ProjectedTimelineRow[]): string {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index].item;
    if (item.type === "user_message") {
      return item.text.trim();
    }
  }
  return "";
}

function safeJsonStringify(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function orEmpty(value: string | null | undefined): string {
  return value ?? "";
}

function describeEditOutput(detail: Extract<ToolCallDetail, { type: "edit" }>): string {
  if (detail.unifiedDiff) {
    return detail.unifiedDiff;
  }
  return [detail.oldString, detail.newString]
    .filter((value): value is string => typeof value === "string")
    .join("\n---\n");
}

function describeSearchOutput(detail: Extract<ToolCallDetail, { type: "search" }>): string {
  return detail.content ?? (detail.filePaths ?? []).join("\n");
}

function describeToolCallDetail(detail: ToolCallDetail): { args: string; output: string } {
  switch (detail.type) {
    case "shell":
      return { args: detail.command, output: orEmpty(detail.output) };
    case "read":
      return { args: detail.filePath, output: orEmpty(detail.content) };
    case "edit":
      return { args: detail.filePath, output: describeEditOutput(detail) };
    case "write":
      return { args: detail.filePath, output: orEmpty(detail.content) };
    case "search":
      return { args: detail.query, output: describeSearchOutput(detail) };
    case "fetch":
      return { args: detail.url, output: orEmpty(detail.result) };
    case "worktree_setup":
      return { args: detail.branchName, output: detail.log };
    case "sub_agent":
      return { args: orEmpty(detail.description ?? detail.subAgentType), output: detail.log };
    case "plain_text":
      return { args: orEmpty(detail.label), output: orEmpty(detail.text) };
    case "plan":
      return { args: "", output: detail.text };
    case "unknown":
      return { args: safeJsonStringify(detail.input), output: safeJsonStringify(detail.output) };
  }
}

function formatToolCallError(error: unknown): string {
  if (error === null || error === undefined) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  return safeJsonStringify(error);
}

function describeToolCall(item: ToolCallTimelineItem): HandoffToolCall {
  const { args, output } = describeToolCallDetail(item.detail);
  const errorText = item.status === "failed" ? formatToolCallError(item.error) : "";
  const combinedOutput = [output, errorText].filter((part) => part.trim().length > 0).join("\n");
  return {
    name: item.name,
    args: trimToChars(args, MAX_FIELD_CHARS),
    status: item.status,
    output: trimToChars(combinedOutput, MAX_FIELD_CHARS),
  };
}

function extractLastToolCalls(
  rows: readonly ProjectedTimelineRow[],
  max: number,
): HandoffToolCall[] {
  const calls: HandoffToolCall[] = [];
  for (let index = rows.length - 1; index >= 0 && calls.length < max; index -= 1) {
    const item = rows[index].item;
    if (item.type !== "tool_call") {
      continue;
    }
    calls.push(describeToolCall(item));
  }
  return calls.toReversed();
}

/**
 * `git status --short` and `git diff --stat` in `cwd`, with a timeout. Returns null when `cwd` is
 * not a git repository, per docs/agent-routes.md.
 */
async function collectGitSummary(
  runGit: RunGitCommand,
  cwd: string,
): Promise<HandoffGitSummary | null> {
  const repoCheck = await runGit(["rev-parse", "--is-inside-work-tree"], {
    cwd,
    timeout: GIT_COMMAND_TIMEOUT_MS,
    acceptExitCodes: [0, 128],
  });
  if (repoCheck.exitCode !== 0) {
    return null;
  }
  const [status, diffStat] = await Promise.all([
    runGit(["status", "--short"], { cwd, timeout: GIT_COMMAND_TIMEOUT_MS }),
    runGit(["diff", "--stat"], { cwd, timeout: GIT_COMMAND_TIMEOUT_MS }),
  ]);
  return { statusShort: status.stdout, diffStat: diffStat.stdout };
}

/**
 * Gathers every input `formatHandoffPacket` needs except `fromLabel`/`reason`, which the caller
 * (the route failover, or the brief service's own "manual" preview) already knows.
 */
export async function collectHandoffInput(
  deps: {
    briefStore: Pick<AgentBriefStore, "read">;
    agentManager: Pick<AgentManager, "fetchTimeline">;
    runGit: RunGitCommand;
  },
  args: { agentId: string; threadId: string; agentCwd: string },
): Promise<Omit<HandoffPacketInput, "fromLabel" | "reason">> {
  const [record, git] = await Promise.all([
    deps.briefStore.read(args.threadId),
    collectGitSummary(deps.runGit, args.agentCwd),
  ]);
  const threadTimeline = deps.agentManager.fetchTimeline(args.threadId, {
    direction: "tail",
    limit: 0,
  });
  const agentTimeline = deps.agentManager.fetchTimeline(args.agentId, {
    direction: "tail",
    limit: 0,
  });

  return {
    brief: record.brief,
    originalRequest: findFirstUserMessageText(threadTimeline.rows),
    latestUserMessage: findLastUserMessageText(agentTimeline.rows),
    toolCalls: extractLastToolCalls(agentTimeline.rows, MAX_TOOL_CALLS),
    git,
  };
}
