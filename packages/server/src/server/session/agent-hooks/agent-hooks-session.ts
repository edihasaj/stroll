import type pino from "pino";
import type { AgentHookSummary } from "@getpaseo/protocol/agent-hooks";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";

type Inbound<T extends SessionInboundMessage["type"]> = Extract<SessionInboundMessage, { type: T }>;

type AgentHooksMessage = Inbound<"agent.hooks.list.request" | "agent.hooks.trust.request">;

const AGENT_HOOKS_MESSAGE_TYPES = new Set<string>([
  "agent.hooks.list.request",
  "agent.hooks.trust.request",
]);

export function isAgentHooksMessage(msg: SessionInboundMessage): msg is AgentHooksMessage {
  return AGENT_HOOKS_MESSAGE_TYPES.has(msg.type);
}

/** The agent session's hook capability, after the agent is loaded. */
export interface AgentHooksAccess {
  /** Null when the agent's harness has no hooks API. */
  load(agentId: string): Promise<{
    listHooks(): Promise<AgentHookSummary[]>;
    trustHooks(keys: readonly string[]): Promise<void>;
  } | null>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Dispatches `agent.hooks.list` and `agent.hooks.trust` (hook review, docs/agent-hooks.md). */
export class AgentHooksSession {
  constructor(
    private readonly options: {
      access: AgentHooksAccess;
      emit: (msg: SessionOutboundMessage) => void;
      logger: pino.Logger;
    },
  ) {}

  dispatch(msg: AgentHooksMessage): Promise<void> {
    return msg.type === "agent.hooks.list.request" ? this.handleList(msg) : this.handleTrust(msg);
  }

  private async handleList(msg: Inbound<"agent.hooks.list.request">): Promise<void> {
    try {
      const hooks = await this.options.access.load(msg.agentId);
      this.options.emit({
        type: "agent.hooks.list.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          supported: hooks !== null,
          hooks: hooks ? await hooks.listHooks() : [],
          error: null,
        },
      });
    } catch (error) {
      this.options.logger.warn({ err: error, agentId: msg.agentId }, "Listing agent hooks failed");
      this.options.emit({
        type: "agent.hooks.list.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          supported: false,
          hooks: [],
          error: errorMessage(error),
        },
      });
    }
  }

  private async handleTrust(msg: Inbound<"agent.hooks.trust.request">): Promise<void> {
    try {
      const hooks = await this.options.access.load(msg.agentId);
      if (!hooks) throw new Error("This agent's harness has no hooks to review.");
      await hooks.trustHooks(msg.keys);
      this.options.emit({
        type: "agent.hooks.trust.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          hooks: await hooks.listHooks(),
          error: null,
        },
      });
    } catch (error) {
      this.options.logger.warn({ err: error, agentId: msg.agentId }, "Trusting agent hooks failed");
      this.options.emit({
        type: "agent.hooks.trust.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          hooks: [],
          error: errorMessage(error),
        },
      });
    }
  }
}
