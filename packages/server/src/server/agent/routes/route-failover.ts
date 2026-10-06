import {
  readAgentRouteLabels,
  resolveRouteFailoverMode,
  ROUTE_CONTINUED_BY_LABEL,
  ROUTE_CONTINUES_LABEL,
  ROUTE_ENTRY_LABEL,
  ROUTE_ID_LABEL,
  ROUTE_NEXT_PROFILE_LABEL,
  ROUTE_REASON_LABEL,
  ROUTE_STATE_LABEL,
  ROUTE_THREAD_LABEL,
  type AgentRoute,
  type AgentRouteFailureReason,
  type AgentRouteLabels,
} from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { AgentManagerEvent, ManagedAgent } from "../agent-manager.js";
import { classifyRouteFailure } from "./classify-failure.js";
import type { AgentRouteDaemonConfig } from "./preflight.js";
import { requireRoute, resolveOwnProfileId, resolveProfileLabel } from "./route-config.js";
import type { AgentRouteServiceDeps } from "./route-service.js";

export interface UsableEntry {
  entryIndex: number;
  profile: AgentProfile;
}

/** Entries strictly after `afterIndex`, in order; the agent's own (failed) entry is never retried. */
export async function findNextUsableEntry(
  deps: AgentRouteServiceDeps,
  route: AgentRoute,
  afterIndex: number,
  config: AgentRouteDaemonConfig,
): Promise<UsableEntry | null> {
  for (let index = afterIndex + 1; index < route.entries.length; index += 1) {
    const result = await deps.preflight.checkEntry(route, index);
    if (!result.ok) {
      continue;
    }
    const profile = (config.agentProfiles ?? []).find(
      (candidate) => candidate.id === route.entries[index]!.profileId,
    );
    if (!profile) {
      continue;
    }
    return { entryIndex: index, profile };
  }
  return null;
}

/** Creates the continuation agent, marks `fromAgent` continued, notifies both, and records the event. */
export async function moveThread(
  deps: AgentRouteServiceDeps,
  fromAgent: ManagedAgent,
  route: AgentRoute,
  threadId: string,
  reason: AgentRouteFailureReason,
  next: UsableEntry,
  eventKind: "failover" | "resumed",
): Promise<string> {
  const config = deps.readDaemonConfig();
  const fromLabel = resolveProfileLabel(fromAgent, config);
  const packet = await deps.handoff.buildPacket({ agentId: fromAgent.id, reason, fromLabel });

  const created = await deps.createAgent({
    kind: "mcp",
    provider: next.profile.provider,
    title: fromAgent.config.title?.trim() || "Agent",
    initialPrompt: packet,
    config: {
      model: next.profile.model,
      accountProfileId: next.profile.accountProfileId,
    },
    cwd: fromAgent.cwd,
    workspaceId: fromAgent.workspaceId,
    mode: next.profile.modeId,
    thinking: next.profile.thinkingOptionId,
    features: next.profile.featureValues,
    labels: {
      [ROUTE_ID_LABEL]: route.id,
      [ROUTE_ENTRY_LABEL]: String(next.entryIndex),
      [ROUTE_THREAD_LABEL]: threadId,
      [ROUTE_CONTINUES_LABEL]: fromAgent.id,
      [ROUTE_STATE_LABEL]: "active",
    },
    background: true,
    notifyOnFinish: false,
  });
  const newAgentId = created.snapshot.id;

  await deps.agentManager.setLabels(fromAgent.id, {
    [ROUTE_STATE_LABEL]: "continued",
    [ROUTE_CONTINUED_BY_LABEL]: newAgentId,
    [ROUTE_REASON_LABEL]: reason,
  });

  const message = `${fromLabel} ${describeFailure(reason)}. Continuing on ${next.profile.name}.`;
  await Promise.all([
    deps.appendNotification(fromAgent.id, message),
    deps.appendNotification(newAgentId, message),
  ]);

  await deps.handoff.appendEvent(threadId, {
    at: new Date().toISOString(),
    kind: eventKind,
    fromAgentId: fromAgent.id,
    toAgentId: newAgentId,
    fromProfileId: resolveOwnProfileId(fromAgent, config),
    toProfileId: next.profile.id,
    reason,
    detail: null,
  });

  return newAgentId;
}

/** `continueThread` on an `awaiting_choice` agent: do what auto failover would have done. */
export async function acceptAwaitingChoice(
  deps: AgentRouteServiceDeps,
  agent: ManagedAgent,
  route: AgentRoute,
  threadId: string,
  routeLabels: AgentRouteLabels,
): Promise<string> {
  const nextProfileId = routeLabels.nextProfileId;
  if (!nextProfileId) {
    throw new Error(`Agent ${agent.id} has no offered next profile`);
  }
  const entryIndex = route.entries.findIndex((entry) => entry.profileId === nextProfileId);
  if (entryIndex === -1) {
    throw new Error(`Offered profile ${nextProfileId} is no longer on route ${route.id}`);
  }
  const result = await deps.preflight.checkEntry(route, entryIndex);
  if (!result.ok) {
    throw new Error(
      `${result.profileName ?? nextProfileId} is still unusable: ${result.reason} — ${result.detail}`,
    );
  }
  const config = deps.readDaemonConfig();
  const profile = config.agentProfiles?.find((candidate) => candidate.id === nextProfileId);
  if (!profile) {
    throw new Error(`Agent profile not found: ${nextProfileId}`);
  }
  const reason = routeLabels.reason ?? "unreachable";
  return moveThread(deps, agent, route, threadId, reason, { entryIndex, profile }, "failover");
}

async function markAwaitingChoice(
  deps: AgentRouteServiceDeps,
  agent: ManagedAgent,
  threadId: string,
  reason: AgentRouteFailureReason,
  next: UsableEntry,
  config: AgentRouteDaemonConfig,
): Promise<void> {
  await deps.agentManager.setLabels(agent.id, {
    [ROUTE_STATE_LABEL]: "awaiting_choice",
    [ROUTE_NEXT_PROFILE_LABEL]: next.profile.id,
    [ROUTE_REASON_LABEL]: reason,
  });
  const fromLabel = resolveProfileLabel(agent, config);
  await deps.appendNotification(
    agent.id,
    `${fromLabel} ${describeFailure(reason)}. Continue on ${next.profile.name}?`,
    "warning",
  );
  await deps.handoff.appendEvent(threadId, {
    at: new Date().toISOString(),
    kind: "awaiting_choice",
    fromAgentId: agent.id,
    toAgentId: null,
    fromProfileId: resolveOwnProfileId(agent, config),
    toProfileId: next.profile.id,
    reason,
    detail: null,
  });
}

async function markPaused(
  deps: AgentRouteServiceDeps,
  agent: ManagedAgent,
  route: AgentRoute,
  threadId: string,
  reason: AgentRouteFailureReason,
  config: AgentRouteDaemonConfig,
): Promise<void> {
  await deps.agentManager.setLabels(agent.id, {
    [ROUTE_STATE_LABEL]: "paused",
    [ROUTE_REASON_LABEL]: reason,
  });
  const fromLabel = resolveProfileLabel(agent, config);
  await deps.appendNotification(
    agent.id,
    `${fromLabel} ${describeFailure(reason)}, and nothing else on ${route.name} is usable right ` +
      "now. The context is kept; resume when a model is available.",
    "warning",
  );
  await deps.handoff.appendEvent(threadId, {
    at: new Date().toISOString(),
    kind: "paused",
    fromAgentId: agent.id,
    toAgentId: null,
    fromProfileId: resolveOwnProfileId(agent, config),
    toProfileId: null,
    reason,
    detail: null,
  });
}

/**
 * Handles a classified `turn_failed` for a routed, active agent: auto failover, an `ask` offer,
 * or pausing the thread when nothing is usable (docs/agent-routes.md, "Failover"). `busyAgentIds`
 * is the re-entrancy guard shared with `AgentRouteService`'s RPC methods.
 */
export async function handleAgentManagerEvent(
  deps: AgentRouteServiceDeps,
  busyAgentIds: Set<string>,
  event: AgentManagerEvent,
): Promise<void> {
  if (event.type !== "agent_stream" || event.event.type !== "turn_failed") {
    return;
  }
  const reason = classifyRouteFailure(event.event);
  if (!reason) {
    // An ordinary failure stays visible as one; failover never hides a real error.
    return;
  }
  await handleRouteFailure(deps, busyAgentIds, event.agentId, reason);
}

/**
 * Moves a routed, active agent's thread on after a failure of the given kind: auto failover, an
 * `ask` offer, or pausing the thread when nothing is usable. Shared by the `turn_failed` handler
 * and the stall watch (`stall-watch.ts`).
 */
export async function handleRouteFailure(
  deps: AgentRouteServiceDeps,
  busyAgentIds: Set<string>,
  agentId: string,
  reason: AgentRouteFailureReason,
): Promise<void> {
  if (busyAgentIds.has(agentId)) {
    // A move for this agent is already in flight; a replayed or duplicate delivery of the same
    // failure must not start a second one.
    return;
  }
  const agent = deps.agentManager.getAgent(agentId);
  if (!agent) {
    return;
  }
  const routeLabels = readAgentRouteLabels(agent.labels);
  if (!routeLabels || routeLabels.state !== "active") {
    // Not routed, or already moved past "active" — including a failure event replayed from
    // history for an agent that has since continued, paused, or switched back.
    return;
  }

  busyAgentIds.add(agentId);
  try {
    const config = deps.readDaemonConfig();
    const route = requireRoute(config, routeLabels.routeId);
    const threadId = routeLabels.threadId ?? agent.id;
    const next = await findNextUsableEntry(deps, route, routeLabels.entryIndex ?? -1, config);

    if (!next) {
      await markPaused(deps, agent, route, threadId, reason, config);
      return;
    }
    if (resolveRouteFailoverMode(route) === "ask") {
      await markAwaitingChoice(deps, agent, threadId, reason, next, config);
      return;
    }
    await moveThread(deps, agent, route, threadId, reason, next, "failover");
  } catch (error) {
    deps.logger.error({ err: error, agentId }, "Agent route failover failed");
  } finally {
    busyAgentIds.delete(agentId);
  }
}

/** Completes "<profile> …" in the route notifications, e.g. "Qwen (Spark) was not reachable". */
function describeFailure(reason: AgentRouteFailureReason): string {
  switch (reason) {
    case "auth":
      return "was signed out";
    case "quota":
      return "ran out of usage or credits";
    case "unreachable":
      return "was not reachable";
    case "manual":
      return "was switched away from";
  }
}
