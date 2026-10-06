import type pino from "pino";
import { readAgentRouteLabels } from "@getpaseo/protocol/agent-route";
import type {
  AgentBrief,
  AgentBriefEdit,
  AgentRouteEvent,
  AgentRouteFailureReason,
} from "@getpaseo/protocol/agent-route";
import type { AgentManager, AgentManagerEvent, ManagedAgent } from "../agent-manager.js";
import type { AgentBriefHandlers, AgentBriefView, RouteHandoffSource } from "../routes/handlers.js";
import { runGitCommand } from "../../../utils/run-git-command.js";
import { createAgentBriefStore, type AgentBriefStore } from "./brief-store.js";
import { collectHandoffInput, formatHandoffPacket } from "./handoff-packet.js";
import type { AgentBriefDaemonConfig, AgentBriefGenerator } from "./brief-generator.js";

export interface AgentBriefServiceDeps {
  agentManager: Pick<AgentManager, "subscribe" | "getAgent" | "fetchTimeline">;
  readDaemonConfig: () => AgentBriefDaemonConfig;
  /** `$PASEO_HOME`; briefs are stored under `<paseoHome>/agent-briefs/`. */
  paseoHome: string;
  generator: AgentBriefGenerator;
  logger: pino.Logger;
}

interface QueuedRegeneration {
  agent: ManagedAgent;
  promise: Promise<AgentBrief | null>;
}

/**
 * `AgentBriefHandlers` + `RouteHandoffSource` (packages/server/src/server/agent/routes/handlers.ts),
 * per docs/agent-routes.md ("The brief and the handoff packet").
 */
export class AgentBriefService implements AgentBriefHandlers, RouteHandoffSource {
  private readonly store: AgentBriefStore;
  private readonly runningByThread = new Map<string, Promise<AgentBrief | null>>();
  private readonly queuedByThread = new Map<string, QueuedRegeneration>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: AgentBriefServiceDeps) {
    this.store = createAgentBriefStore({ paseoHome: deps.paseoHome, logger: deps.logger });
  }

  /**
   * Subscribes to `AgentManager` events. On `turn_completed` for an agent whose labels carry
   * `stroll.route`, regenerates the thread's brief. Idempotent.
   */
  start(): void {
    if (this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.deps.agentManager.subscribe(
      (event) => this.handleAgentManagerEvent(event),
      { replayState: false },
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async get(agentId: string, options?: { refresh?: boolean }): Promise<AgentBriefView> {
    const agent = this.requireAgent(agentId);
    const threadId = resolveThreadId(agent);
    if (options?.refresh) {
      await this.scheduleRegeneration(threadId, agent);
    }
    const record = await this.store.read(threadId);
    const fromLabel = resolveAgentProfileLabel(agent, this.deps.readDaemonConfig());
    const handoffPreview = await this.buildPacket({ agentId, reason: "manual", fromLabel });
    return { brief: record.brief, handoffPreview, events: record.events };
  }

  async update(agentId: string, edit: AgentBriefEdit): Promise<AgentBrief> {
    const agent = this.requireAgent(agentId);
    const threadId = resolveThreadId(agent);
    const brief: AgentBrief = {
      threadId,
      ...edit,
      updatedAt: new Date().toISOString(),
      editedByUser: true,
    };
    await this.store.writeBrief(threadId, brief);
    return brief;
  }

  async buildPacket(input: {
    agentId: string;
    reason: AgentRouteFailureReason;
    fromLabel: string;
  }): Promise<string> {
    const agent = this.requireAgent(input.agentId);
    const threadId = resolveThreadId(agent);
    const collected = await collectHandoffInput(
      {
        briefStore: this.store,
        agentManager: this.deps.agentManager,
        runGit: runGitCommand,
      },
      { agentId: input.agentId, threadId, agentCwd: agent.cwd },
    );
    return formatHandoffPacket({ ...collected, fromLabel: input.fromLabel, reason: input.reason });
  }

  async appendEvent(threadId: string, event: AgentRouteEvent): Promise<void> {
    await this.store.appendEvent(threadId, event);
  }

  /**
   * `AgentSubscriber` is declared `(event) => void`, so the real dispatcher never awaits this; the
   * returned promise exists so tests can await the fire-and-forget regeneration it starts. It
   * never rejects: a regeneration failure is logged here, per docs/agent-routes.md.
   */
  private handleAgentManagerEvent(event: AgentManagerEvent): Promise<void> | undefined {
    if (event.type !== "agent_stream" || event.event.type !== "turn_completed") {
      return undefined;
    }
    const agent = this.deps.agentManager.getAgent(event.agentId);
    if (!agent) {
      return undefined;
    }
    const routeLabels = readAgentRouteLabels(agent.labels);
    if (!routeLabels) {
      return undefined;
    }
    const threadId = routeLabels.threadId ?? agent.id;
    return this.scheduleRegeneration(threadId, agent).then(
      () => undefined,
      (error: unknown) => {
        this.deps.logger.warn(
          { err: error, threadId, agentId: agent.id },
          "Agent brief regeneration failed",
        );
      },
    );
  }

  /**
   * Never two generations per thread at once; a completion during a generation queues exactly one
   * more (the latest agent wins), per docs/agent-routes.md.
   */
  private scheduleRegeneration(threadId: string, agent: ManagedAgent): Promise<AgentBrief | null> {
    const running = this.runningByThread.get(threadId);
    if (!running) {
      return this.runRegeneration(threadId, agent);
    }
    const queued = this.queuedByThread.get(threadId);
    if (queued) {
      this.queuedByThread.set(threadId, { agent, promise: queued.promise });
      return queued.promise;
    }
    const promise = running
      .catch(() => undefined)
      .then(() => {
        const next = this.queuedByThread.get(threadId);
        this.queuedByThread.delete(threadId);
        return this.runRegeneration(threadId, next ? next.agent : agent);
      });
    this.queuedByThread.set(threadId, { agent, promise });
    return promise;
  }

  private runRegeneration(threadId: string, agent: ManagedAgent): Promise<AgentBrief | null> {
    const promise = this.regenerateAndStore(threadId, agent).finally(() => {
      if (this.runningByThread.get(threadId) === promise) {
        this.runningByThread.delete(threadId);
      }
    });
    this.runningByThread.set(threadId, promise);
    return promise;
  }

  private async regenerateAndStore(threadId: string, agent: ManagedAgent): Promise<AgentBrief> {
    const record = await this.store.read(threadId);
    const brief = await this.deps.generator.regenerate({
      agent,
      threadId,
      previousBrief: record.brief,
    });
    await this.store.writeBrief(threadId, brief);
    return brief;
  }

  private requireAgent(agentId: string): ManagedAgent {
    const agent = this.deps.agentManager.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }
}

export function createAgentBriefService(deps: AgentBriefServiceDeps): AgentBriefService {
  return new AgentBriefService(deps);
}

/** Id of the thread's first agent, per `stroll.route.thread`; falls back to the agent's own id. */
function resolveThreadId(agent: Pick<ManagedAgent, "id" | "labels">): string {
  return readAgentRouteLabels(agent.labels)?.threadId ?? agent.id;
}

/** The agent's own profile/provider label, e.g. "Qwen (Spark)", for the handoff preview. */
export function resolveAgentProfileLabel(
  agent: Pick<ManagedAgent, "labels" | "config">,
  daemonConfig: AgentBriefDaemonConfig,
): string {
  const routeLabels = readAgentRouteLabels(agent.labels);
  if (routeLabels && routeLabels.entryIndex !== null) {
    const route = (daemonConfig.agentRoutes ?? []).find(
      (candidate) => candidate.id === routeLabels.routeId,
    );
    const entry = route?.entries[routeLabels.entryIndex];
    const profile = entry
      ? (daemonConfig.agentProfiles ?? []).find((candidate) => candidate.id === entry.profileId)
      : undefined;
    if (profile) {
      return profile.name;
    }
  }
  return agent.config.model
    ? `${agent.config.provider} (${agent.config.model})`
    : agent.config.provider;
}
