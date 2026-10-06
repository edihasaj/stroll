import type pino from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { AgentRouting } from "../../agent/routes/handlers.js";

type Inbound<T extends SessionInboundMessage["type"]> = Extract<SessionInboundMessage, { type: T }>;

const NOT_AVAILABLE = "Agent routes are not available on this host.";

const AGENT_ROUTING_MESSAGE_TYPES = new Set<string>([
  "agent.brief.get.request",
  "agent.brief.update.request",
  "agent.route.preflight.request",
  "agent.route.continue.request",
  "agent.route.switch_back.request",
]);

type AgentRoutingMessage = Inbound<
  | "agent.brief.get.request"
  | "agent.brief.update.request"
  | "agent.route.preflight.request"
  | "agent.route.continue.request"
  | "agent.route.switch_back.request"
>;

export function isAgentRoutingMessage(msg: SessionInboundMessage): msg is AgentRoutingMessage {
  return AGENT_ROUTING_MESSAGE_TYPES.has(msg.type);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Dispatches the `agent.brief.*` and `agent.route.*` RPCs (docs/agent-routes.md). */
export class AgentRoutingSession {
  private readonly routing: AgentRouting | null;
  private readonly emit: (msg: SessionOutboundMessage) => void;
  private readonly logger: pino.Logger;

  constructor(options: {
    routing: AgentRouting | null | undefined;
    emit: (msg: SessionOutboundMessage) => void;
    logger: pino.Logger;
  }) {
    this.routing = options.routing ?? null;
    this.emit = options.emit;
    this.logger = options.logger;
  }

  dispatch(msg: AgentRoutingMessage): Promise<void> {
    switch (msg.type) {
      case "agent.brief.get.request":
        return this.handleBriefGet(msg);
      case "agent.brief.update.request":
        return this.handleBriefUpdate(msg);
      case "agent.route.preflight.request":
        return this.handlePreflight(msg);
      case "agent.route.continue.request":
        return this.handleContinue(msg);
      case "agent.route.switch_back.request":
        return this.handleSwitchBack(msg);
    }
  }

  async handleBriefGet(msg: Inbound<"agent.brief.get.request">): Promise<void> {
    try {
      if (!this.routing) throw new Error(NOT_AVAILABLE);
      const view = await this.routing.briefs.get(msg.agentId, { refresh: msg.refresh === true });
      this.emit({
        type: "agent.brief.get.response",
        payload: { requestId: msg.requestId, agentId: msg.agentId, ...view, error: null },
      });
    } catch (error) {
      this.logger.warn({ err: error, agentId: msg.agentId }, "agent.brief.get.request failed");
      this.emit({
        type: "agent.brief.get.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          brief: null,
          handoffPreview: null,
          events: [],
          error: errorMessage(error),
        },
      });
    }
  }

  async handleBriefUpdate(msg: Inbound<"agent.brief.update.request">): Promise<void> {
    try {
      if (!this.routing) throw new Error(NOT_AVAILABLE);
      const brief = await this.routing.briefs.update(msg.agentId, msg.brief);
      this.emit({
        type: "agent.brief.update.response",
        payload: { requestId: msg.requestId, agentId: msg.agentId, brief, error: null },
      });
    } catch (error) {
      this.logger.warn({ err: error, agentId: msg.agentId }, "agent.brief.update.request failed");
      this.emit({
        type: "agent.brief.update.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          brief: null,
          error: errorMessage(error),
        },
      });
    }
  }

  async handlePreflight(msg: Inbound<"agent.route.preflight.request">): Promise<void> {
    try {
      if (!this.routing) throw new Error(NOT_AVAILABLE);
      const results = await this.routing.routes.preflight(msg.routeId);
      this.emit({
        type: "agent.route.preflight.response",
        payload: { requestId: msg.requestId, routeId: msg.routeId, results, error: null },
      });
    } catch (error) {
      this.logger.warn(
        { err: error, routeId: msg.routeId },
        "agent.route.preflight.request failed",
      );
      this.emit({
        type: "agent.route.preflight.response",
        payload: {
          requestId: msg.requestId,
          routeId: msg.routeId,
          results: [],
          error: errorMessage(error),
        },
      });
    }
  }

  async handleContinue(msg: Inbound<"agent.route.continue.request">): Promise<void> {
    const payload = await this.move(msg, (routing) => routing.routes.continueThread(msg.agentId));
    this.emit({ type: "agent.route.continue.response", payload });
  }

  async handleSwitchBack(msg: Inbound<"agent.route.switch_back.request">): Promise<void> {
    const payload = await this.move(msg, (routing) => routing.routes.switchBack(msg.agentId));
    this.emit({ type: "agent.route.switch_back.response", payload });
  }

  private async move(
    msg: { requestId: string; agentId: string; type: string },
    run: (routing: AgentRouting) => Promise<string>,
  ) {
    try {
      if (!this.routing) throw new Error(NOT_AVAILABLE);
      const targetAgentId = await run(this.routing);
      return { requestId: msg.requestId, agentId: msg.agentId, targetAgentId, error: null };
    } catch (error) {
      this.logger.warn({ err: error, agentId: msg.agentId }, `${msg.type} failed`);
      return {
        requestId: msg.requestId,
        agentId: msg.agentId,
        targetAgentId: null,
        error: errorMessage(error),
      };
    }
  }
}
