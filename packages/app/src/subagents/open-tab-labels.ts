import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";

export function getAgentTabsNeedingOpenLabel(input: {
  tabs: WorkspaceTab[];
  getAgent: (agentId: string) => Agent | null | undefined;
  label: string;
  pendingAgentIds: ReadonlySet<string>;
}): string[] {
  const agentIds = new Set<string>();
  for (const tab of input.tabs) {
    if (tab.target.kind !== "agent") {
      continue;
    }
    const agent = input.getAgent(tab.target.agentId);
    if (
      agent?.parentAgentId &&
      agent.labels[input.label] !== "true" &&
      !input.pendingAgentIds.has(agent.id)
    ) {
      agentIds.add(agent.id);
    }
  }
  return [...agentIds];
}

/**
 * Subagents that were open in a tab and no longer are, while this client still marks them open.
 * Their label has to go: the server holds back a parent's cascade archive from a subagent any
 * client has open. Closing the tab clears it directly; this catches a subagent that leaves the
 * layout another way, such as another chat replacing it in the main view.
 */
export function getSubagentsLeavingTabs(input: {
  previousAgentIds: ReadonlySet<string>;
  openAgentIds: ReadonlySet<string>;
  getAgent: (agentId: string) => Agent | null | undefined;
  label: string;
}): string[] {
  const leaving: string[] = [];
  for (const agentId of input.previousAgentIds) {
    if (input.openAgentIds.has(agentId)) {
      continue;
    }
    const agent = input.getAgent(agentId);
    if (agent?.parentAgentId && !agent.archivedAt && agent.labels[input.label] === "true") {
      leaving.push(agentId);
    }
  }
  return leaving;
}
