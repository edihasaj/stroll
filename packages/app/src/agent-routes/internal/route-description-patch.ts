import type { AgentRoute } from "@getpaseo/protocol/agent-route";

/**
 * Builds the full `agentRoutes` array to patch after editing one route's `description`
 * (`useAgentRoutesConfig.updateRouteDescription`) — the daemon config patch replaces the whole
 * field, so every other route must come back unchanged. Trimmed-empty removes the field instead
 * of persisting `description: ""`, matching how an absent description reads upstream (agent
 * routes without one are simply not described, not "described as nothing").
 */
export function applyRouteDescriptionPatch(input: {
  routes: readonly AgentRoute[];
  routeId: string;
  description: string;
}): AgentRoute[] {
  const trimmed = input.description.trim();
  return input.routes.map((route) => {
    if (route.id !== input.routeId) {
      return route;
    }
    if (trimmed.length === 0) {
      const { description: _removed, ...withoutDescription } = route;
      return withoutDescription;
    }
    return { ...route, description: trimmed };
  });
}
