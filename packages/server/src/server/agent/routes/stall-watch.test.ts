import { describe, expect, it } from "vitest";
import {
  ROUTE_ENTRY_LABEL,
  ROUTE_ID_LABEL,
  ROUTE_STATE_LABEL,
  ROUTE_THREAD_LABEL,
  type AgentRoute,
  type AgentRoutePreflightResult,
} from "@getpaseo/protocol/agent-route";
import type { AgentManagerEvent, ManagedAgent } from "../agent-manager.js";
import type { AgentRouteDaemonConfig } from "./preflight.js";
import { RouteStallWatch } from "./stall-watch.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";

const PROBED_ROUTE: AgentRoute = {
  id: "worker",
  name: "Worker",
  entries: [
    { profileId: "qwen", privacy: "local", probeUrl: "http://spark-a:8000/v1" },
    { profileId: "codex" },
  ],
};

function routedAgent(id: string, entryIndex: number, state = "active"): ManagedAgent {
  return {
    id,
    labels: {
      [ROUTE_ID_LABEL]: "worker",
      [ROUTE_ENTRY_LABEL]: String(entryIndex),
      [ROUTE_THREAD_LABEL]: id,
      [ROUTE_STATE_LABEL]: state,
    },
  } as unknown as ManagedAgent;
}

function streamEvent(agentId: string, type: string): AgentManagerEvent {
  return { type: "agent_stream", agentId, event: { type } } as unknown as AgentManagerEvent;
}

function harness(options: { agents: ManagedAgent[]; probe: AgentRoutePreflightResult }) {
  let now = 1_000_000;
  const agents = new Map(options.agents.map((agent) => [agent.id, agent]));
  const canceled: string[] = [];
  const failedOver: string[] = [];
  const probes: number[] = [];
  const config: AgentRouteDaemonConfig = { agentRoutes: [PROBED_ROUTE], agentProfiles: [] };
  const watch = new RouteStallWatch({
    agentManager: {
      getAgent: (id) => agents.get(id) ?? null,
      cancelAgentRun: async (id) => {
        canceled.push(id);
      },
    },
    readDaemonConfig: () => config,
    preflight: {
      checkEntry: async (_route, index) => {
        probes.push(index);
        return options.probe;
      },
    },
    onUnreachable: async (id) => {
      failedOver.push(id);
    },
    logger: createTestLogger(),
    stallMs: 60_000,
    now: () => now,
  });
  return {
    watch,
    canceled,
    failedOver,
    probes,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const UNREACHABLE: AgentRoutePreflightResult = {
  profileId: "qwen",
  profileName: "Qwen (Spark)",
  ok: false,
  reason: "unreachable",
  detail: "GET http://spark-a:8000/v1/models timed out",
};
const READY: AgentRoutePreflightResult = {
  profileId: "qwen",
  profileName: "Qwen (Spark)",
  ok: true,
  reason: null,
  detail: null,
};

describe("RouteStallWatch", () => {
  it("cancels a silent routed turn whose endpoint is unreachable and hands it to failover", async () => {
    const h = harness({ agents: [routedAgent("a", 0)], probe: UNREACHABLE });
    h.watch.observe(streamEvent("a", "turn_started"));
    h.advance(61_000);

    await h.watch.check();

    expect(h.probes).toEqual([0]);
    expect(h.canceled).toEqual(["a"]);
    expect(h.failedOver).toEqual(["a"]);
  });

  it("leaves a silent turn alone while its endpoint answers, and only re-checks after another window", async () => {
    const h = harness({ agents: [routedAgent("a", 0)], probe: READY });
    h.watch.observe(streamEvent("a", "turn_started"));
    h.advance(61_000);
    await h.watch.check();
    h.advance(15_000);
    await h.watch.check();

    expect(h.probes).toEqual([0]);
    expect(h.canceled).toEqual([]);
    expect(h.failedOver).toEqual([]);
  });

  it("does not probe a turn that keeps producing events", async () => {
    const h = harness({ agents: [routedAgent("a", 0)], probe: UNREACHABLE });
    h.watch.observe(streamEvent("a", "turn_started"));
    h.advance(50_000);
    h.watch.observe(streamEvent("a", "timeline"));
    h.advance(50_000);

    await h.watch.check();

    expect(h.probes).toEqual([]);
  });

  it("never cancels a turn on an entry without a probe, however long it is silent", async () => {
    const h = harness({ agents: [routedAgent("a", 1)], probe: UNREACHABLE });
    h.watch.observe(streamEvent("a", "turn_started"));
    h.advance(10 * 60_000);

    await h.watch.check();

    expect(h.probes).toEqual([]);
    expect(h.canceled).toEqual([]);
  });

  it("stops watching once the turn ends", async () => {
    const h = harness({ agents: [routedAgent("a", 0)], probe: UNREACHABLE });
    h.watch.observe(streamEvent("a", "turn_started"));
    h.watch.observe(streamEvent("a", "turn_completed"));
    h.advance(61_000);

    await h.watch.check();

    expect(h.probes).toEqual([]);
  });

  it("tracks a turn that starts before the route labels are stamped", async () => {
    const agent = { id: "a", labels: {} } as unknown as ManagedAgent;
    const h = harness({ agents: [agent], probe: UNREACHABLE });
    h.watch.observe(streamEvent("a", "turn_started"));
    Object.assign(agent, { labels: routedAgent("a", 0).labels });
    h.advance(61_000);

    await h.watch.check();

    expect(h.canceled).toEqual(["a"]);
  });

  it("ignores agents that are not on a route or not active", async () => {
    const h = harness({
      agents: [routedAgent("paused", 0, "paused"), { id: "plain", labels: {} } as ManagedAgent],
      probe: UNREACHABLE,
    });
    h.watch.observe(streamEvent("paused", "turn_started"));
    h.watch.observe(streamEvent("plain", "turn_started"));
    h.advance(61_000);

    await h.watch.check();

    expect(h.probes).toEqual([]);
  });
});
