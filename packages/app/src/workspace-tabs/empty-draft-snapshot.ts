import { buildDraftStoreKey } from "@/stores/draft-keys";
import type { DraftRecord } from "@/stores/draft-store/state";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";

/** A draft the user has not touched: no record, a cleared one, or one with no text and no attachments. */
export function isDraftRecordEmpty(record: DraftRecord | undefined): boolean {
  if (!record || record.lifecycle !== "active") {
    return true;
  }
  return record.input.text.length === 0 && record.input.attachments.length === 0;
}

/**
 * Inputs reconcile needs to let a newer agent take an empty draft's place in the main view.
 * Draft emptiness is read from `drafts` when the snapshot is built, not subscribed to: it only
 * matters at the moment an agent appears, and typing must not trigger a reconcile.
 */
export function buildEmptyDraftSnapshotInputs(input: {
  serverId: string;
  tabs: readonly WorkspaceTab[];
  drafts: Record<string, DraftRecord>;
  agents: ReadonlyMap<string, Agent> | undefined;
  autoOpenAgentIds: Iterable<string>;
}): { emptyDraftIds: ReadonlySet<string>; agentCreatedAtById: ReadonlyMap<string, number> } {
  const emptyDraftIds = new Set<string>();
  for (const tab of input.tabs) {
    if (tab.target.kind !== "draft") {
      continue;
    }
    const draftKey = buildDraftStoreKey({
      serverId: input.serverId,
      agentId: tab.tabId,
      draftId: tab.target.draftId,
    });
    if (isDraftRecordEmpty(input.drafts[draftKey])) {
      emptyDraftIds.add(tab.target.draftId);
    }
  }
  const agentCreatedAtById = new Map<string, number>();
  for (const agentId of input.autoOpenAgentIds) {
    const createdAt = input.agents?.get(agentId)?.createdAt?.getTime();
    if (createdAt !== undefined && Number.isFinite(createdAt)) {
      agentCreatedAtById.set(agentId, createdAt);
    }
  }
  return { emptyDraftIds, agentCreatedAtById };
}
