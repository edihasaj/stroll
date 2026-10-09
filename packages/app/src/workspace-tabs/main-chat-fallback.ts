import type { ChatHistory } from "@/stores/workspace-chat-history-store";

interface OrderMainChatCandidatesInput {
  history: ChatHistory;
  serverId: string;
  workspaceId: string;
  /** The workspace's live root chats. Only these can come back into the main view. */
  candidateAgentIds: ReadonlySet<string>;
  lastActivityAt: (agentId: string) => number;
}

/**
 * The order in which an empty main view picks its chat, best first. A chat the user had open
 * before comes first, newest first, read from the global history up to its cursor; a chat the
 * history never saw follows by recent activity. Entries that are archived, deleted, or live in
 * another workspace are skipped.
 */
export function orderMainChatCandidates(input: OrderMainChatCandidatesInput): string[] {
  const { history, serverId, workspaceId, candidateAgentIds, lastActivityAt } = input;
  const ordered: string[] = [];
  const taken = new Set<string>();
  for (let index = Math.min(history.cursor, history.entries.length - 1); index >= 0; index -= 1) {
    const entry = history.entries[index];
    if (
      entry.serverId === serverId &&
      entry.workspaceId === workspaceId &&
      candidateAgentIds.has(entry.agentId) &&
      !taken.has(entry.agentId)
    ) {
      ordered.push(entry.agentId);
      taken.add(entry.agentId);
    }
  }
  const rest = [...candidateAgentIds]
    .filter((agentId) => !taken.has(agentId))
    .sort((a, b) => lastActivityAt(b) - lastActivityAt(a) || (a < b ? -1 : 1));
  return [...ordered, ...rest];
}
