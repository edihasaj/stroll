import { getPaseoToolLeafName } from "@getpaseo/protocol/tool-name-normalization";
import { describeToolCall } from "@/tool-calls/detail-level/grouping";
import type { StreamItem } from "@/types/stream";

const COMMAND_LABEL_LIMIT = 60;

/**
 * What a running turn is doing right now, for the live footer: Codex names the step ("Running
 * npm test", "Reading app.ts") instead of a bare "Working".
 */
export type LiveActivity =
  | { kind: "thinking" }
  | { kind: "running"; command: string }
  | { kind: "reading"; file: string }
  | { kind: "editing"; file: string }
  | { kind: "searching"; query: string }
  | { kind: "fetching"; host: string }
  | { kind: "subagent" }
  | { kind: "tool"; name: string };

function basename(filePath: string): string {
  const trimmed = filePath.replace(/[/\\]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

function commandLabel(command: string): string {
  const firstLine = command.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.length > COMMAND_LABEL_LIMIT
    ? `${firstLine.slice(0, COMMAND_LABEL_LIMIT - 1)}…`
    : firstLine;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function describeToolActivity(item: Extract<StreamItem, { kind: "tool_call" }>): LiveActivity {
  const { detail, name } = describeToolCall(item);
  switch (detail.type) {
    case "shell":
      return detail.command.trim()
        ? { kind: "running", command: commandLabel(detail.command) }
        : { kind: "tool", name };
    case "read":
      return { kind: "reading", file: basename(detail.filePath) };
    case "edit":
    case "write":
      return { kind: "editing", file: basename(detail.filePath) };
    case "search":
      return { kind: "searching", query: detail.query.trim() };
    case "fetch":
      return { kind: "fetching", host: hostOf(detail.url) };
    case "sub_agent":
      return { kind: "subagent" };
    default:
      break;
  }
  const leaf = getPaseoToolLeafName(name);
  if (leaf === "create_agent") return { kind: "subagent" };
  return { kind: "tool", name: leaf ?? name };
}

function isInFlight(item: Extract<StreamItem, { kind: "tool_call" }>): boolean {
  const { status } = describeToolCall(item);
  return status === "running" || status === "executing";
}

/**
 * Reads the newest item of the running turn: an in-flight tool call names its step, a streaming
 * thought means the agent is thinking, and anything else (answer text, a finished call) leaves
 * the plain "Working" label.
 */
export function resolveLiveActivity(items: readonly StreamItem[]): LiveActivity | null {
  const last = items.at(-1);
  if (!last) return null;
  if (last.kind === "tool_call") return isInFlight(last) ? describeToolActivity(last) : null;
  if (last.kind === "thought") return { kind: "thinking" };
  return null;
}
