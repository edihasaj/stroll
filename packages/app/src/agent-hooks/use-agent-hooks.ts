import { useCallback, useEffect, useMemo, useState } from "react";
import { hooksNeedingReview, type AgentHookSummary } from "@getpaseo/protocol/agent-hooks";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";

const NONE: AgentHookSummary[] = [];

export interface AgentHooksState {
  /** New or changed hooks the harness will not run until the user allows them. */
  needingReview: AgentHookSummary[];
  trust: (keys: readonly string[]) => Promise<void>;
}

/**
 * The agent's hooks that need review, for harnesses with a hooks API (Codex). Read when the chat
 * opens and again after each finished turn; only a running session is asked, so a closed chat
 * never starts its harness to answer (docs/agent-hooks.md).
 */
export function useAgentHooks(serverId: string, agentId: string): AgentHooksState {
  const supported = useHostFeature(serverId, "agentHooks");
  const client = useHostRuntimeClient(serverId);
  const isLive = useSessionStore((state) => {
    const status = state.sessions[serverId]?.agents.get(agentId)?.status;
    return status === "idle" || status === "running";
  });
  const lastTurnEndedAt = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(agentId)?.lastTurn?.endedAt.getTime() ?? 0,
  );
  const [hooks, setHooks] = useState<AgentHookSummary[]>(NONE);

  useEffect(() => {
    if (!supported || !client || !isLive) {
      setHooks(NONE);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await client.listAgentHooks(agentId);
        if (!cancelled) setHooks(result.hooks);
      } catch {
        if (!cancelled) setHooks(NONE);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId, client, isLive, lastTurnEndedAt, supported]);

  const trust = useCallback(
    async (keys: readonly string[]) => {
      if (!client) throw new Error("Not connected to the host");
      setHooks(await client.trustAgentHooks(agentId, keys));
    },
    [agentId, client],
  );

  const needingReview = useMemo(() => hooksNeedingReview(hooks), [hooks]);
  return { needingReview, trust };
}
