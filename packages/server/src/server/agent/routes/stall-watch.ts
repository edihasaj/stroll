import type { Logger } from "pino";
import { readAgentRouteLabels } from "@getpaseo/protocol/agent-route";
import type { AgentManager, AgentManagerEvent } from "../agent-manager.js";
import type { AgentRouteDaemonConfig, AgentRoutePreflight } from "./preflight.js";

/**
 * A provider pointed at an endpoint that drops packets (a powered-off or firewalled Spark) does
 * not fail its turn; it waits on the connection and retries for minutes. The stall watch notices a
 * routed turn that has produced nothing for `stallMs`, re-runs its entry's `probeUrl` check, and
 * when the endpoint is unreachable cancels the turn and hands the thread to failover.
 *
 * Only entries with `probeUrl` are watched: without a probe there is no way to tell a dead
 * endpoint from a long-running tool, and a long silence alone never cancels anything.
 */
export const DEFAULT_STALL_MS = 60_000;
export const DEFAULT_STALL_CHECK_EVERY_MS = 15_000;

export interface RouteStallWatchDeps {
  agentManager: Pick<AgentManager, "getAgent"> & {
    cancelAgentRun: (agentId: string) => Promise<unknown>;
  };
  readDaemonConfig: () => AgentRouteDaemonConfig;
  preflight: Pick<AgentRoutePreflight, "checkEntry">;
  /** Runs failover for an agent whose turn was canceled as stalled. */
  onUnreachable: (agentId: string) => Promise<void>;
  logger: Logger;
  stallMs?: number;
  checkEveryMs?: number;
  now?: () => number;
}

export class RouteStallWatch {
  /** Agents with a turn in flight, and when they last produced a stream event. */
  private readonly lastActivityAt = new Map<string, number>();
  private readonly checking = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly stallMs: number;
  private readonly checkEveryMs: number;
  private readonly now: () => number;

  constructor(private readonly deps: RouteStallWatchDeps) {
    this.stallMs = deps.stallMs ?? DEFAULT_STALL_MS;
    this.checkEveryMs = deps.checkEveryMs ?? DEFAULT_STALL_CHECK_EVERY_MS;
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.check(), this.checkEveryMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastActivityAt.clear();
  }

  observe(event: AgentManagerEvent): void {
    if (event.type !== "agent_stream") return;
    const { agentId } = event;
    switch (event.event.type) {
      case "turn_started":
        // Tracked whether or not the agent is routed yet: a routed agent's first turn starts
        // before its route labels are stamped. Labels are read when the turn goes quiet.
        this.lastActivityAt.set(agentId, this.now());
        return;
      case "turn_completed":
      case "turn_failed":
      case "turn_canceled":
        this.lastActivityAt.delete(agentId);
        return;
      default:
        if (this.lastActivityAt.has(agentId)) this.lastActivityAt.set(agentId, this.now());
    }
  }

  /** One sweep. Exposed for tests; the interval calls it in production. */
  async check(): Promise<void> {
    const cutoff = this.now() - this.stallMs;
    const stalled = [...this.lastActivityAt].filter(
      ([agentId, at]) => at <= cutoff && !this.checking.has(agentId),
    );
    await Promise.all(stalled.map(([agentId]) => this.checkAgent(agentId)));
  }

  private async checkAgent(agentId: string): Promise<void> {
    this.checking.add(agentId);
    try {
      const target = this.resolveProbedEntry(agentId);
      if (!target) {
        // No probe to ask, or the agent is no longer an active routed agent: stop watching the
        // turn rather than re-checking it every sweep.
        this.lastActivityAt.delete(agentId);
        return;
      }
      const result = await this.deps.preflight.checkEntry(target.route, target.entryIndex);
      if (result.ok || result.reason !== "unreachable") {
        // Alive: a long tool run or a slow model. Look again after another quiet window.
        if (this.lastActivityAt.has(agentId)) this.lastActivityAt.set(agentId, this.now());
        return;
      }
      this.lastActivityAt.delete(agentId);
      this.deps.logger.warn(
        { agentId, entryIndex: target.entryIndex, detail: result.detail },
        "Routed turn stalled on an unreachable endpoint; canceling it for failover",
      );
      await this.deps.agentManager.cancelAgentRun(agentId);
      await this.deps.onUnreachable(agentId);
    } catch (error) {
      this.deps.logger.warn({ err: error, agentId }, "Route stall check failed");
    } finally {
      this.checking.delete(agentId);
    }
  }

  private resolveProbedEntry(agentId: string) {
    const agent = this.deps.agentManager.getAgent(agentId);
    const labels = readAgentRouteLabels(agent?.labels ?? null);
    if (!labels || labels.state !== "active" || labels.entryIndex === null) return null;
    const route = (this.deps.readDaemonConfig().agentRoutes ?? []).find(
      (candidate) => candidate.id === labels.routeId,
    );
    const entry = route?.entries[labels.entryIndex];
    if (!route || !entry?.probeUrl) return null;
    return { route, entryIndex: labels.entryIndex };
  }
}
