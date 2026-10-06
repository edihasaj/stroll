import type {
  AgentBrief,
  AgentBriefEdit,
  AgentRouteEvent,
  AgentRouteFailureReason,
  AgentRoutePreflightResult,
} from "@getpaseo/protocol/agent-route";

/*
 * The seams between the WebSocket session, the route service, and the brief service
 * (docs/agent-routes.md). The session only dispatches; both services implement these.
 */

/** What the session needs from the route service. */
export interface AgentRouteHandlers {
  preflight(routeId: string): Promise<AgentRoutePreflightResult[]>;
  /**
   * Accept an `awaiting_choice` offer or resume a `paused` thread. Returns the agent the thread now
   * runs on.
   */
  continueThread(agentId: string): Promise<string>;
  /** Undo a failover. Returns the agent the thread now runs on. */
  switchBack(agentId: string): Promise<string>;
}

export interface AgentBriefView {
  brief: AgentBrief | null;
  /** The packet the next profile would receive if the thread failed over now. */
  handoffPreview: string | null;
  events: AgentRouteEvent[];
}

/** What the session needs from the brief service. */
export interface AgentBriefHandlers {
  get(agentId: string, options?: { refresh?: boolean }): Promise<AgentBriefView>;
  update(agentId: string, edit: AgentBriefEdit): Promise<AgentBrief>;
}

/** The brief service, as the route service sees it. */
export interface RouteHandoffSource {
  /** The handoff packet for the thread `agentId` belongs to, built from current state. */
  buildPacket(input: {
    agentId: string;
    reason: AgentRouteFailureReason;
    /** Display name of the profile the work comes from, e.g. "Qwen (Spark)". */
    fromLabel: string;
  }): Promise<string>;
  appendEvent(threadId: string, event: AgentRouteEvent): Promise<void>;
}

export interface AgentRouting {
  routes: AgentRouteHandlers;
  briefs: AgentBriefHandlers;
}
