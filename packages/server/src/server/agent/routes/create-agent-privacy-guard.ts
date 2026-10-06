import type { AgentRoutePrivacy } from "@getpaseo/protocol/agent-route";

/** The calling agent's own route id and resolved privacy, or null when it is not on a route. */
export interface CreateAgentPrivacyGuardCaller {
  routeId: string;
  privacy: AgentRoutePrivacy;
}

/** What `create_agent` resolved to run the new agent on (see `CreateAgentProviderResolution`). */
export type CreateAgentPrivacyGuardTarget =
  | { kind: "provider" }
  | { kind: "route"; routeId: string; privacy: AgentRoutePrivacy };

/**
 * A thread on a local route must stay local, so its subagents must too (docs/agent-routes.md): an
 * agent routed on a local route can only spawn subagents on another local route. Returns the
 * rejection message, or null when the call is allowed.
 */
export function checkCreateAgentPrivacyGuard(
  caller: CreateAgentPrivacyGuardCaller | null,
  target: CreateAgentPrivacyGuardTarget,
): string | null {
  if (!caller || caller.privacy !== "local") {
    return null;
  }
  const base =
    `This agent runs on the local route \`${caller.routeId}\`, so its subagents must run on a ` +
    "local route too.";
  if (target.kind === "provider") {
    return `${base} Pass \`route\` with a local route (see list_profiles).`;
  }
  if (target.privacy === "local") {
    return null;
  }
  return (
    `${base} Route \`${target.routeId}\` is not local — ` +
    "pass `route` with a local route (see list_profiles)."
  );
}
