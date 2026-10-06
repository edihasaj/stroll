import type { Logger } from "pino";
import {
  readAgentRouteLabels,
  ROUTE_CONTINUED_BY_LABEL,
  ROUTE_REASON_LABEL,
  ROUTE_STATE_LABEL,
  type AgentRoutePreflightResult,
} from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { AgentManager, ManagedAgent } from "../agent-manager.js";
import type { CreateAgentCommandInput, CreateAgentCommandResult } from "../create-agent/create.js";
import type { AgentRouteDaemonConfig, AgentRoutePreflight } from "./preflight.js";
import type { AgentRouteHandlers, RouteHandoffSource } from "./handlers.js";
import {
  requireProfile,
  requireRoute,
  resolveProfileLabel,
  resolveOwnProfileId,
} from "./route-config.js";
import {
  acceptAwaitingChoice,
  findNextUsableEntry,
  handleAgentManagerEvent,
  handleRouteFailure,
  moveThread,
} from "./route-failover.js";
import { RouteStallWatch } from "./stall-watch.js";

/** The first usable entry for a fresh (non-continuation) routed agent. */
export interface RouteCreationResolution {
  entryIndex: number;
  profile: AgentProfile;
}

/** What creation call sites (session, MCP, CLI) need from the route service. */
export interface RouteCreationResolver {
  resolveForCreate(routeId: string): Promise<RouteCreationResolution>;
}

type NotificationLevel = "info" | "warning" | "error";

export interface AgentRouteServiceDeps {
  agentManager: Pick<AgentManager, "subscribe" | "getAgent" | "setLabels">;
  /** The daemon-side agent creation path (packages/server/src/server/agent/create-agent/create.ts). */
  createAgent: (input: CreateAgentCommandInput) => Promise<CreateAgentCommandResult>;
  /** Sends a message to an existing agent (packages/server/src/server/agent/agent-prompt.ts). */
  sendPrompt: (agentId: string, prompt: string) => Promise<void>;
  /** Appends a `notification` timeline row (packages/server/src/server/agent/timeline-append.ts). */
  appendNotification: (
    agentId: string,
    message: string,
    level?: NotificationLevel,
  ) => Promise<void>;
  preflight: AgentRoutePreflight;
  readDaemonConfig: () => AgentRouteDaemonConfig;
  handoff: RouteHandoffSource;
  /**
   * Loads an agent that is not in memory, e.g. the one a continuation came from after a daemon
   * restart. Returns null when the agent no longer exists. Defaults to in-memory agents only.
   */
  loadAgent?: (agentId: string) => Promise<ManagedAgent | null>;
  /**
   * Cancels an agent's running turn. When given, a routed turn stalled on an unreachable
   * `probeUrl` is canceled and failed over (`stall-watch.ts`).
   */
  cancelAgentRun?: (agentId: string) => Promise<unknown>;
  logger: Logger;
}

function describeFailedEntry(index: number, result: AgentRoutePreflightResult): string {
  const name = result.profileName ?? result.profileId;
  return `entry ${index} (${name}): ${result.reason} — ${result.detail}`;
}

/**
 * Implements the route side of `AgentRouting` (packages/server/src/server/agent/routes/handlers.ts),
 * per docs/agent-routes.md: preflight, creating routed agents, and failover/continue/switch-back.
 * The failure-handling mechanics (what a classified `turn_failed` does) live in `route-failover.ts`;
 * this class is the RPC/creation surface over them.
 */
export class AgentRouteService implements AgentRouteHandlers, RouteCreationResolver {
  private unsubscribe: (() => void) | null = null;
  /** Agent ids with a failover/continue/switch-back move in progress. Re-entrancy guard. */
  private readonly busyAgentIds = new Set<string>();
  private readonly stallWatch: RouteStallWatch | null;

  constructor(private readonly deps: AgentRouteServiceDeps) {
    const cancelAgentRun = deps.cancelAgentRun;
    this.stallWatch = cancelAgentRun
      ? new RouteStallWatch({
          agentManager: { getAgent: (id) => deps.agentManager.getAgent(id), cancelAgentRun },
          readDaemonConfig: deps.readDaemonConfig,
          preflight: deps.preflight,
          onUnreachable: (agentId) =>
            handleRouteFailure(deps, this.busyAgentIds, agentId, "unreachable"),
          logger: deps.logger,
        })
      : null;
  }

  /** Subscribes to `AgentManager` events. Idempotent. */
  start(): void {
    if (this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.deps.agentManager.subscribe(
      (event) => {
        this.stallWatch?.observe(event);
        void handleAgentManagerEvent(this.deps, this.busyAgentIds, event);
      },
      { replayState: false },
    );
    this.stallWatch?.start();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stallWatch?.stop();
  }

  async resolveForCreate(routeId: string): Promise<RouteCreationResolution> {
    const config = this.deps.readDaemonConfig();
    const route = requireRoute(config, routeId);
    const reasons: string[] = [];
    for (let index = 0; index < route.entries.length; index += 1) {
      const result = await this.deps.preflight.checkEntry(route, index);
      if (result.ok) {
        return {
          entryIndex: index,
          profile: requireProfile(config, route.entries[index]!.profileId),
        };
      }
      reasons.push(describeFailedEntry(index, result));
    }
    throw new Error(`No usable entry for route ${routeId}: ${reasons.join("; ")}`);
  }

  preflight(routeId: string): Promise<AgentRoutePreflightResult[]> {
    return this.deps.preflight.checkRoute(routeId);
  }

  async continueThread(agentId: string): Promise<string> {
    const agent = await this.resolveAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const routeLabels = readAgentRouteLabels(agent.labels);
    if (!routeLabels) {
      throw new Error(`Agent ${agentId} is not on a route`);
    }

    return this.withExclusiveAccess([agentId], async () => {
      const threadId = routeLabels.threadId ?? agent.id;

      // Check the agent's own state before touching the route config, so a stale or removed
      // route never masks the real problem for an agent that was never waiting on one.
      if (routeLabels.state === "awaiting_choice") {
        const config = this.deps.readDaemonConfig();
        const route = requireRoute(config, routeLabels.routeId);
        return acceptAwaitingChoice(this.deps, agent, route, threadId, routeLabels);
      }
      if (routeLabels.state === "paused") {
        const config = this.deps.readDaemonConfig();
        const route = requireRoute(config, routeLabels.routeId);
        const next = await findNextUsableEntry(this.deps, route, -1, config);
        if (!next) {
          throw new Error(`No usable entry for route ${route.id}`);
        }
        return moveThread(
          this.deps,
          agent,
          route,
          threadId,
          routeLabels.reason ?? "unreachable",
          next,
          "resumed",
        );
      }
      throw new Error(`Agent ${agentId} is ${routeLabels.state}, not awaiting_choice or paused`);
    });
  }

  async switchBack(agentId: string): Promise<string> {
    const continuationAgent = await this.resolveAgent(agentId);
    if (!continuationAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const continuationLabels = readAgentRouteLabels(continuationAgent.labels);
    if (!continuationLabels || !continuationLabels.continuesAgentId) {
      throw new Error(`Agent ${agentId} is not a route continuation`);
    }
    if (continuationAgent.lifecycle !== "idle") {
      throw new Error(`Agent ${agentId} must be idle to switch back`);
    }
    const continuedAgentId = continuationLabels.continuesAgentId;

    return this.withExclusiveAccess([agentId, continuedAgentId], async () => {
      const continuedAgent = await this.resolveAgent(continuedAgentId);
      if (!continuedAgent) {
        throw new Error(`Agent ${continuedAgentId} no longer exists`);
      }
      const continuedLabels = readAgentRouteLabels(continuedAgent.labels);
      if (!continuedLabels || continuedLabels.entryIndex === null) {
        throw new Error(`Agent ${continuedAgentId} has no route entry to switch back to`);
      }
      const config = this.deps.readDaemonConfig();
      const route = requireRoute(config, continuationLabels.routeId);
      const result = await this.deps.preflight.checkEntry(route, continuedLabels.entryIndex);
      if (!result.ok) {
        throw new Error(
          `${result.profileName ?? "That entry"} is still unusable: ${result.reason} — ${result.detail}`,
        );
      }

      const threadId = continuationLabels.threadId ?? continuedAgentId;
      const fromLabel = resolveProfileLabel(continuationAgent, config);
      const packet = await this.deps.handoff.buildPacket({
        agentId: continuationAgent.id,
        reason: "manual",
        fromLabel,
      });
      await this.deps.sendPrompt(continuedAgentId, packet);

      await this.deps.agentManager.setLabels(continuedAgentId, { [ROUTE_STATE_LABEL]: "active" });
      await this.deps.agentManager.setLabels(agentId, {
        [ROUTE_STATE_LABEL]: "continued",
        [ROUTE_CONTINUED_BY_LABEL]: continuedAgentId,
        [ROUTE_REASON_LABEL]: "manual",
      });

      const toLabel = result.profileName ?? "the previous profile";
      const message = `Switched back to ${toLabel} from ${fromLabel}.`;
      await Promise.all([
        this.deps.appendNotification(continuedAgentId, message),
        this.deps.appendNotification(agentId, message),
      ]);

      await this.deps.handoff.appendEvent(threadId, {
        at: new Date().toISOString(),
        kind: "switch_back",
        fromAgentId: agentId,
        toAgentId: continuedAgentId,
        fromProfileId: resolveOwnProfileId(continuationAgent, config),
        toProfileId: route.entries[continuedLabels.entryIndex]?.profileId ?? null,
        reason: "manual",
        detail: null,
      });

      return continuedAgentId;
    });
  }

  /** Throws if any of `agentIds` already has a move in progress; otherwise runs `fn` with them locked. */
  private async resolveAgent(agentId: string): Promise<ManagedAgent | null> {
    const live = this.deps.agentManager.getAgent(agentId);
    if (live) return live;
    return (await this.deps.loadAgent?.(agentId)) ?? null;
  }

  private async withExclusiveAccess<T>(
    agentIds: readonly string[],
    fn: () => Promise<T>,
  ): Promise<T> {
    const busy = agentIds.find((id) => this.busyAgentIds.has(id));
    if (busy) {
      throw new Error(`Agent ${busy} already has a route move in progress`);
    }
    for (const id of agentIds) {
      this.busyAgentIds.add(id);
    }
    try {
      return await fn();
    } finally {
      for (const id of agentIds) {
        this.busyAgentIds.delete(id);
      }
    }
  }
}

export function createAgentRouteService(deps: AgentRouteServiceDeps): AgentRouteService {
  return new AgentRouteService(deps);
}
