import path from "node:path";
import { z } from "zod";
import type { AgentHookSummary } from "@getpaseo/protocol/agent-hooks";

const CodexHookMetadataSchema = z
  .object({
    key: z.string(),
    eventName: z.string(),
    source: z.string().catch("unknown"),
    sourcePath: z.string(),
    currentHash: z.string(),
    trustStatus: z.enum(["trusted", "untrusted", "modified", "managed"]).catch("untrusted"),
    enabled: z.boolean().catch(true),
    matcher: z.string().nullable().optional(),
    command: z.string().optional(),
  })
  .passthrough();

const CodexHooksListResponseSchema = z.object({
  data: z.array(z.object({ hooks: z.array(z.unknown()).catch([]) }).passthrough()),
});

export interface CodexHookList {
  hooks: AgentHookSummary[];
  /** Slot key to the hash of the hook's current content, the value Codex trusts. */
  hashByKey: Map<string, string>;
}

/** Maps a `hooks/list` response to the summaries the app reviews. Unreadable entries are skipped. */
export function parseCodexHooksList(response: unknown): CodexHookList {
  const parsed = CodexHooksListResponseSchema.parse(response);
  const hooks: AgentHookSummary[] = [];
  const hashByKey = new Map<string, string>();
  for (const entry of parsed.data) {
    for (const raw of entry.hooks) {
      const hook = CodexHookMetadataSchema.safeParse(raw);
      if (!hook.success || hashByKey.has(hook.data.key)) continue;
      hashByKey.set(hook.data.key, hook.data.currentHash);
      hooks.push({
        key: hook.data.key,
        event: hook.data.eventName,
        source: hook.data.source,
        sourcePath: hook.data.sourcePath,
        command: hook.data.command ?? null,
        matcher: hook.data.matcher ?? null,
        trustStatus: hook.data.trustStatus,
        enabled: hook.data.enabled,
      });
    }
  }
  return { hooks, hashByKey };
}

/**
 * The `config/value/write` value that trusts `keys` at their current content. Written as an
 * upsert under `hooks.state`, the way Codex stores trust, so the slot keys (absolute paths with
 * colons) need no escaping inside a key path.
 */
export function buildHookTrustWrite(
  keys: readonly string[],
  hashByKey: ReadonlyMap<string, string>,
): Record<string, { trusted_hash: string }> {
  const value: Record<string, { trusted_hash: string }> = {};
  for (const key of keys) {
    const hash = hashByKey.get(key);
    if (!hash) throw new Error(`Hook ${key} is no longer configured`);
    value[key] = { trusted_hash: hash };
  }
  return value;
}

const HookRunSchema = z
  .object({
    eventName: z.string(),
    status: z.string(),
    sourcePath: z.string(),
    entries: z.array(z.object({ kind: z.string(), text: z.string() }).passthrough()).catch([]),
  })
  .passthrough();

const HookCompletedParamsSchema = z.object({ run: HookRunSchema }).passthrough();

const NOTABLE_STATUS = new Set(["failed", "blocked", "stopped"]);
const NOTABLE_ENTRY_KINDS = new Set(["error", "warning", "stop", "feedback"]);

export interface HookRunNotice {
  level: "warning" | "error";
  message: string;
}

/**
 * A notice for a finished hook run that the user should see: one that failed, blocked or stopped
 * the agent, or reported an error, warning, or feedback. A quiet successful run shows nothing.
 */
export function describeHookRunNotice(params: unknown): HookRunNotice | null {
  const parsed = HookCompletedParamsSchema.safeParse(params);
  if (!parsed.success) return null;
  const { run } = parsed.data;
  const notableEntry = run.entries.find((entry) => NOTABLE_ENTRY_KINDS.has(entry.kind));
  if (!NOTABLE_STATUS.has(run.status) && !notableEntry) return null;
  const file = path.basename(run.sourcePath);
  const detail = notableEntry?.text.trim().split("\n")[0];
  const outcome = NOTABLE_STATUS.has(run.status) ? run.status : (notableEntry?.kind ?? run.status);
  return {
    level: run.status === "failed" || notableEntry?.kind === "error" ? "error" : "warning",
    message: `Hook ${run.eventName} (${file}) ${outcome}${detail ? `: ${detail}` : ""}`,
  };
}
