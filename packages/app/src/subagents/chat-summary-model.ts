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
