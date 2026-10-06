import { readAgentRouteLabels, type AgentRoute } from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { ManagedAgent } from "../agent-manager.js";
import type { AgentRouteDaemonConfig } from "./preflight.js";

/** Looks up a route by id in the daemon config, or throws a clear error. */
export function requireRoute(config: AgentRouteDaemonConfig, routeId: string): AgentRoute {
  const route = (config.agentRoutes ?? []).find((candidate) => candidate.id === routeId);
  if (!route) {
    throw new Error(`Agent route not found: ${routeId}`);
  }
  return route;
}

/** Looks up a profile by id in the daemon config, or throws a clear error. */
export function requireProfile(config: AgentRouteDaemonConfig, profileId: string): AgentProfile {
  const profile = (config.agentProfiles ?? []).find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Agent profile not found: ${profileId}`);
  }
  return profile;
}

/** The id of the profile backing the agent's own route entry, from its labels. */
export function resolveOwnProfileId(
  agent: Pick<ManagedAgent, "labels">,
  config: AgentRouteDaemonConfig,
): string | null {
  const labels = readAgentRouteLabels(agent.labels);
  if (!labels || labels.entryIndex === null) {
    return null;
  }
  const route = (config.agentRoutes ?? []).find((candidate) => candidate.id === labels.routeId);
  return route?.entries[labels.entryIndex]?.profileId ?? null;
}

/**
 * The agent's own profile display name, e.g. "Qwen (Spark)", for notifications and the handoff
 * packet's `from` label. Falls back to provider (model) when the profile can't be resolved.
 */
export function resolveProfileLabel(
  agent: Pick<ManagedAgent, "labels" | "config">,
  config: AgentRouteDaemonConfig,
): string {
  const labels = readAgentRouteLabels(agent.labels);
  if (labels && labels.entryIndex !== null) {
    const route = (config.agentRoutes ?? []).find((candidate) => candidate.id === labels.routeId);
    const entry = route?.entries[labels.entryIndex];
    const profile = entry
      ? (config.agentProfiles ?? []).find((candidate) => candidate.id === entry.profileId)
      : undefined;
    if (profile) {
      return profile.name;
    }
  }
  return agent.config.model
    ? `${agent.config.provider} (${agent.config.model})`
    : agent.config.provider;
}
