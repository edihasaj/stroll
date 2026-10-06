import type { Logger } from "pino";

import type { AgentManager } from "./agent-manager.js";
import type { AgentStorage } from "./agent-storage.js";
import { sendPromptToAgent } from "./agent-prompt.js";
import { buildAgentPrompt } from "./prompt-attachments.js";

export interface AgentQueueDrainOptions {
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  logger: Logger;
}

/**
 * Delivers daemon-queued prompts one at a time, each when its agent is idle. There is one drain
 * per daemon: a drain per client session stalled whenever no client was connected and let two
 * clients race to deliver into the same idle agent.
 *
 * Delivery steers instead of interrupting. The agent is idle when the drain starts, but a client
 * can start a turn before the prompt lands; steering joins that turn or puts the prompt back in
 * the queue instead of canceling the user's work.
 */
export function startAgentQueueDrain(options: AgentQueueDrainOptions): () => void {
  const { agentManager, agentStorage, logger } = options;
  const queueStore = agentStorage.queueStore;
  // Also guards against re-entry: the drain's own take/restore/fallback writes notify the queue
  // listener synchronously while the agent is still marked in flight.
  const inFlight = new Set<string>();

  function isIdle(agentId: string): boolean {
    const agent = agentManager.getAgent(agentId);
    return agent?.lifecycle === "idle" && agent.activeForegroundTurnId === null;
  }

  async function drain(agentId: string): Promise<void> {
    if (inFlight.has(agentId)) return;
    inFlight.add(agentId);
    try {
      const queued = await queueStore.take(agentId);
      if (!queued) return;
      try {
        await sendPromptToAgent({
          agentManager,
          agentStorage,
          agentId,
          prompt: buildAgentPrompt(queued.text, undefined, queued.attachments),
          // An accepted steer records its transcript row only under a client message id.
          messageId: queued.id,
          activeTurnBehavior: "steer",
          clearPendingPermissions: true,
          createdByClientId: queued.createdByClientId,
          logger,
        });
      } catch (error) {
        await queueStore.restoreFront(queued);
        logger.warn({ err: error, agentId }, "Failed to drain queued agent prompt");
      }
    } finally {
      inFlight.delete(agentId);
    }
  }

  const unsubscribeAgents = agentManager.subscribe(
    (event) => {
      if (event.type !== "agent_state") return;
      if (event.agent.lifecycle !== "idle" || event.agent.activeForegroundTurnId !== null) return;
      void drain(event.agent.id);
    },
    { replayState: false },
  );
  // A prompt queued just as the turn ended would otherwise wait for the next idle transition.
  const unsubscribeQueue = queueStore.subscribe((agentId, prompts) => {
    if (prompts.length === 0 || !isIdle(agentId)) return;
    void drain(agentId);
  });

  return () => {
    unsubscribeAgents();
    unsubscribeQueue();
  };
}
