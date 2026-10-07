import type { SubagentRow } from "./select";
import { isFinishedSubagent } from "./archive-finished";

export interface ChatSummary {
  /** Waiting on a permission, or failed. */
  needsYou: number;
  working: number;
  done: number;
}

/** The counts the summary card shows for a chat's subagents, or null when it has none. */
export function buildChatSummary(rows: readonly SubagentRow[]): ChatSummary | null {
  if (rows.length === 0) return null;
  const summary: ChatSummary = { needsYou: 0, working: 0, done: 0 };
  for (const row of rows) {
    if (row.requiresAttention) summary.needsYou += 1;
    else if (isFinishedSubagent(row)) summary.done += 1;
    else summary.working += 1;
  }
  return summary;
}

/**
 * The host names to append to the summary line when one or more rows live on a connected host
 * other than the parent's own (docs/peers.md "In the app") — `null` when every row is local.
 * Lists every distinct remote host rather than a count, so "· MacBook" stays legible without a
 * new translated phrase for "N computers".
 */
export function resolveRemoteHostSummaryLabel(
  rows: readonly SubagentRow[],
  parentServerId: string,
  hostNames: ReadonlyMap<string, string>,
): string | null {
  const remoteHostServerIds = new Set(
    rows.map((row) => row.hostServerId).filter((hostServerId) => hostServerId !== parentServerId),
  );
  if (remoteHostServerIds.size === 0) return null;
  return Array.from(remoteHostServerIds)
    .map((hostServerId) => hostNames.get(hostServerId) ?? hostServerId)
    .join(", ");
}
