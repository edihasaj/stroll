import type { Agent } from "@/stores/session-store";

export type CloseAgentTabPolicy = { kind: "archive-on-close" } | { kind: "layout-only" };

export function resolveCloseAgentTabPolicy(
  agent: Pick<Agent, "parentAgentId"> | null | undefined,
): CloseAgentTabPolicy {
  if (agent?.parentAgentId) {
    return { kind: "layout-only" };
  }

  return { kind: "archive-on-close" };
}

export type CloseAgentConfirmation = "none" | "archive" | "archive-running";

/**
 * Closing a root agent's tab archives the chat, so it always asks first; a running agent gets the
 * warning that archiving stops it. A subagent's close only changes the layout and never asks.
 */
export function resolveCloseAgentConfirmation(
  agent: Pick<Agent, "parentAgentId" | "status"> | null | undefined,
): CloseAgentConfirmation {
  if (resolveCloseAgentTabPolicy(agent).kind === "layout-only") {
    return "none";
  }
  return agent?.status === "running" ? "archive-running" : "archive";
}
