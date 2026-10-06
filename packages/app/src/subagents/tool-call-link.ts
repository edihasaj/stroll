import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { getPaseoToolLeafName } from "@getpaseo/protocol/tool-name-normalization";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Claude hands an MCP result over as the text the model saw: the daemon's model-visible format
 * (`formatStructuredContentForModel` in the server), which is the JSON alone or a few
 * `key_count=` summary lines, a blank line, then the JSON.
 */
function parseModelVisibleText(text: string): unknown {
  const direct = parseJsonText(text);
  if (direct !== undefined) return direct;
  const jsonStart = text.indexOf("\n\n{");
  return jsonStart === -1 ? undefined : parseJsonText(text.slice(jsonStart + 2));
}

/**
 * Mirrors `unwrapMcpResult` in `packages/protocol/src/paseo-tool-call-detail.ts`, which is not
 * exported. The `create_agent` tool's result arrives as a raw MCP envelope — either a
 * `structuredContent` object or a single text content block carrying a JSON string — or, from
 * Claude, as the plain model-visible text. The `agentId` the daemon assigned lives inside it, not
 * at the top level.
 */
function unwrapMcpToolResult(output: unknown): unknown {
  if (typeof output === "string") return parseModelVisibleText(output) ?? output;
  if (!isRecord(output)) return output;
  // The Claude provider wraps a tool result as `{ output }`: the parsed JSON, or the text as is.
  if ("output" in output && !("agentId" in output)) {
    return unwrapMcpToolResult(output.output);
  }
  if (output.structuredContent !== undefined) {
    return output.structuredContent;
  }
  if (Array.isArray(output.content) && output.content.length === 1) {
    const item: unknown = output.content[0];
    if (isRecord(item) && item.type === "text") {
      return parseJsonText(item.text) ?? item.text;
    }
  }
  return output;
}

/**
 * The managed agent id a `create_agent` tool call created, or `null` when this is not a
 * `create_agent` call or it has no result yet (still running, or failed before returning one).
 */
export function extractCreatedAgentId(toolName: string, output: unknown): string | null {
  if (getPaseoToolLeafName(toolName) !== "create_agent") {
    return null;
  }
  const unwrapped = unwrapMcpToolResult(output);
  if (
    isRecord(unwrapped) &&
    typeof unwrapped.agentId === "string" &&
    unwrapped.agentId.length > 0
  ) {
    return unwrapped.agentId;
  }
  return null;
}

/**
 * Maps a native `sub_agent` tool call to the id its provider-subagent-store descriptor is keyed
 * under, per server producer (`packages/server/src/server/agent/providers/**`):
 *
 * - **Claude** (`claude/sidechain-tracker.ts`): the synthetic parent "Task" card's `callId` is
 *   the sidechain's `parentToolUseId`, and the descriptor is upserted with `id: parentToolUseId`
 *   — the same value. The detail never carries `childSessionId`.
 * - **OpenCode** (`opencode-agent.ts`): `registerOpenCodeSubAgentToolCall` copies the linked
 *   child session id onto `detail.childSessionId`, and the descriptor is upserted with
 *   `id: childSessionId` — the same value.
 * - **Codex** (`codex-app-server-agent.ts`): the descriptor id is an internal `childThreadId`
 *   that is never put on the client-visible detail, and one `spawnAgent` tool call can fan out
 *   to several child threads at once — there is no single id to recover from the call alone.
 * - **OMP** (`omp/subagent-card-tracker.ts`, `omp/subagent-index.ts`): the descriptor id is OMP's
 *   own opaque subagent id. The only identifier surfaced on the client detail is
 *   `childSessionId`, which OMP fills with a session *file path* — a different value from the
 *   descriptor id — and one tool call can aggregate several OMP subagents by index, so even that
 *   path names only the first of them.
 *
 * Any other provider (Pi, Copilot, Antigravity, Muse, a plugin-contributed provider, …) stays
 * unmapped until it is verified the same way: a dead "open" control is worse than none.
 */
export function resolveNativeProviderSubagentId(input: {
  provider: string;
  toolCallId: string | null;
  childSessionId?: string | null;
}): string | null {
  if (input.provider === "claude") {
    return input.toolCallId && input.toolCallId.length > 0 ? input.toolCallId : null;
  }
  if (input.provider === "opencode") {
    return input.childSessionId && input.childSessionId.length > 0 ? input.childSessionId : null;
  }
  return null;
}

export interface SubagentToolCallInput {
  toolName: string;
  detail: ToolCallDetail | undefined;
  provider?: string | null;
  callId?: string | null;
}

export type SubagentToolCallLink =
  | { kind: "managed"; agentId: string }
  | { kind: "native"; provider: string; mappedSubagentId: string | null };

/**
 * Detects a tool call that should render as a compact subagent row instead of a generic tool
 * call: a native provider spawn (`detail.type === "sub_agent"`) or a Paseo `create_agent` MCP
 * call whose result carries an `agentId`. Returns `null` for every other tool call.
 */
export function resolveSubagentToolCallLink(
  input: SubagentToolCallInput,
): SubagentToolCallLink | null {
  if (input.detail?.type === "sub_agent") {
    const provider = input.provider ?? "";
    return {
      kind: "native",
      provider,
      mappedSubagentId: resolveNativeProviderSubagentId({
        provider,
        toolCallId: input.callId ?? null,
        childSessionId: input.detail.childSessionId ?? null,
      }),
    };
  }
  if (input.detail?.type === "unknown") {
    const agentId = extractCreatedAgentId(input.toolName, input.detail.output);
    if (agentId) {
      return { kind: "managed", agentId };
    }
  }
  return null;
}
