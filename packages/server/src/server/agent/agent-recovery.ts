import type { Logger } from "pino";

import { ensureAgentLoaded, type AgentLoaderManager } from "./agent-loading.js";
import type { AgentStorage, StoredAgentRecord } from "./agent-storage.js";
import { toAgentPersistenceHandle } from "../persistence-hooks.js";

interface AgentRecoveryDeps {
  agentManager: AgentLoaderManager;
  agentStorage: AgentStorage;
  logger: Logger;
}

function isInterrupted(record: StoredAgentRecord): boolean {
  return record.lastStatus === "initializing" || record.lastStatus === "running";
}

function recoveryFailureMessage(reason: string): string {
  return `Stroll could not resume this agent after the daemon restart: ${reason}`;
}

async function recordRecoveryFailure(input: {
  agentStorage: AgentRecoveryDeps["agentStorage"];
  agentId: string;
  message: string;
}): Promise<void> {
  const record = await input.agentStorage.get(input.agentId);
  if (!record || record.archivedAt) {
    return;
  }

  const now = new Date().toISOString();
  await input.agentStorage.upsert({
    ...record,
    updatedAt: now,
    lastActivityAt: now,
    lastStatus: "error",
    lastError: input.message,
    requiresAttention: true,
    attentionReason: "error",
    attentionTimestamp: now,
  });
}

async function recoverInterruptedAgent(
  record: StoredAgentRecord,
  deps: AgentRecoveryDeps,
): Promise<void> {
  const registeredProviders = deps.agentManager.getRegisteredProviderIds();
  const handle = toAgentPersistenceHandle(registeredProviders, record.persistence);
  if (!handle) {
    const message = recoveryFailureMessage(
      `the ${record.provider} conversation is not resumable on this daemon`,
    );
    await recordRecoveryFailure({ agentStorage: deps.agentStorage, agentId: record.id, message });
    deps.logger.warn({ agentId: record.id, provider: record.provider }, message);
    return;
  }

  try {
    await ensureAgentLoaded(record.id, {
      agentManager: deps.agentManager,
      agentStorage: deps.agentStorage,
      broadcastTimeline: true,
      logger: deps.logger,
    });
    deps.logger.info(
      { agentId: record.id, provider: record.provider },
      "Recovered interrupted agent",
    );
  } catch (error) {
    if (deps.agentManager.getAgent(record.id)) {
      deps.logger.warn(
        { err: error, agentId: record.id, provider: record.provider },
        "Recovered agent could not hydrate its provider timeline",
      );
      return;
    }
    const reason = error instanceof Error ? error.message : String(error);
    const message = recoveryFailureMessage(reason);
    await recordRecoveryFailure({ agentStorage: deps.agentStorage, agentId: record.id, message });
    deps.logger.warn({ err: error, agentId: record.id, provider: record.provider }, message);
  }
}

/**
 * Recover provider sessions interrupted by a daemon restart before clients can
 * observe stale running records. Failed candidates become explicit errors and
 * are not selected again on a later startup.
 */
export async function recoverInterruptedAgents(deps: AgentRecoveryDeps): Promise<void> {
  const records = await deps.agentStorage.list();
  const interrupted = records.filter((record) => !record.archivedAt && isInterrupted(record));

  for (const record of interrupted) {
    try {
      await recoverInterruptedAgent(record, deps);
    } catch (error) {
      deps.logger.error(
        { err: error, agentId: record.id, provider: record.provider },
        "Failed to recover interrupted agent",
      );
    }
  }
}
