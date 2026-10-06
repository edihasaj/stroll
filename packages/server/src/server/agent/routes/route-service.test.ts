import { describe, expect, it } from "vitest";
import {
  ROUTE_CONTINUED_BY_LABEL,
  ROUTE_CONTINUES_LABEL,
  ROUTE_ENTRY_LABEL,
  ROUTE_ID_LABEL,
  ROUTE_NEXT_PROFILE_LABEL,
  ROUTE_REASON_LABEL,
  ROUTE_STATE_LABEL,
  ROUTE_THREAD_LABEL,
  type AgentRoute,
  type AgentRouteEvent,
  type AgentRoutePreflightResult,
} from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { AgentManager, AgentManagerEvent, ManagedAgent } from "../agent-manager.js";
import type { CreateAgentCommandInput, CreateAgentCommandResult } from "../create-agent/create.js";
import type { AgentRoutePreflight, AgentRouteDaemonConfig } from "./preflight.js";
import type { RouteHandoffSource } from "./handlers.js";
import { createAgentRouteService, type AgentRouteServiceDeps } from "./route-service.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";

const PROFILE_QWEN: AgentProfile = {
  id: "qwen",
  name: "Qwen (Spark)",
  provider: "omp",
  model: "spark",
};
const PROFILE_CLAUDE: AgentProfile = { id: "claude", name: "Claude", provider: "claude" };
const PROFILE_CODEX: AgentProfile = {
  id: "codex-a",
  name: "Codex (personal)",
  provider: "codex",
  model: "gpt-5.5",
};
const CONFIG: AgentRouteDaemonConfig = {
  agentProfiles: [PROFILE_QWEN, PROFILE_CLAUDE, PROFILE_CODEX],
  agentRoutes: [],
};

function buildRoute(
  overrides: Partial<AgentRoute> & { entries: AgentRoute["entries"] },
): AgentRoute {
  // Defaults to "cloud" so tests unrelated to privacy don't trip the route's default privacy.
  return { id: "worker", name: "Worker", privacy: "cloud", failover: "auto", ...overrides };
}

const ROUTE_AUTO = buildRoute({
  failover: "auto",
  entries: [{ profileId: "qwen" }, { profileId: "claude" }, { profileId: "codex-a" }],
});

function buildManagedAgent(overrides: {
  id: string;
  cwd?: string;
  workspaceId?: string;
  provider?: string;
  title?: string | null;
  lifecycle?: ManagedAgent["lifecycle"];
  labels?: Record<string, string>;
}): ManagedAgent {
  const cwd = overrides.cwd ?? "/tmp/agent";
  const provider = overrides.provider ?? "claude";
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: overrides.id,
    provider,
    cwd,
    workspaceId: overrides.workspaceId,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    config: { provider, cwd, title: overrides.title ?? "Fix the bug" },
    lifecycle: overrides.lifecycle ?? "idle",
    session: {},
    createdAt: now,
    updatedAt: now,
    availableModes: [],
    currentModeId: null,
    pendingPermissions: new Map(),
    bufferedPermissionResolutions: new Map(),
    inFlightPermissionResponses: new Set(),
    pendingReplacement: false,
    persistence: null,
    historyPrimed: true,
    lastUserMessageAt: null,
    activeTurnId: null,
    activeTurnStartedAt: null,
    attention: { requiresAttention: false },
    foregroundTurnWaiters: new Set(),
    finalizedForegroundTurnIds: new Set(),
    unsubscribeSession: null,
    labels: overrides.labels ?? {},
    activeForegroundTurnId: null,
  } as unknown as ManagedAgent;
}

function activeAgent(overrides: {
  id: string;
  entryIndex: number;
  routeId?: string;
}): ManagedAgent {
  return buildManagedAgent({
    id: overrides.id,
    workspaceId: "ws-1",
    labels: {
      [ROUTE_ID_LABEL]: overrides.routeId ?? "worker",
      [ROUTE_ENTRY_LABEL]: String(overrides.entryIndex),
      [ROUTE_THREAD_LABEL]: overrides.id,
      [ROUTE_STATE_LABEL]: "active",
    },
  });
}

function turnFailedEvent(agentId: string, error: string): AgentManagerEvent {
  return {
    type: "agent_stream",
    agentId,
    event: { type: "turn_failed", provider: "claude", error },
  };
}

interface FakeAgentManager {
  agentManager: Pick<AgentManager, "subscribe" | "getAgent" | "setLabels">;
  trigger: (event: AgentManagerEvent) => void;
  addAgent: (agent: ManagedAgent) => void;
  subscribeCalls: { count: number };
  setLabelsCalls: Array<{ agentId: string; labels: Record<string, string> }>;
}

function createFakeAgentManager(initialAgents: ManagedAgent[]): FakeAgentManager {
  const agents = new Map(initialAgents.map((agent) => [agent.id, agent]));
  let subscriber: ((event: AgentManagerEvent) => void) | null = null;
  const subscribeCalls = { count: 0 };
  const setLabelsCalls: Array<{ agentId: string; labels: Record<string, string> }> = [];
  return {
    subscribeCalls,
    setLabelsCalls,
    trigger: (event) => subscriber?.(event),
    addAgent: (agent) => agents.set(agent.id, agent),
    agentManager: {
      subscribe(callback) {
        subscribeCalls.count += 1;
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      },
      getAgent(id) {
        return agents.get(id) ?? null;
      },
      async setLabels(agentId, labels) {
        setLabelsCalls.push({ agentId, labels });
        const agent = agents.get(agentId);
        if (!agent) {
          throw new Error(`Unknown agent: ${agentId}`);
        }
        agents.set(agentId, { ...agent, labels: { ...agent.labels, ...labels } });
      },
    },
  };
}

interface FakeCreateAgent {
  createAgent: AgentRouteServiceDeps["createAgent"];
  calls: CreateAgentCommandInput[];
}

function createFakeCreateAgent(addAgent: (agent: ManagedAgent) => void): FakeCreateAgent {
  const calls: CreateAgentCommandInput[] = [];
  let counter = 0;
  return {
    calls,
    createAgent: async (input) => {
      calls.push(input);
      counter += 1;
      const mcpInput = input as Extract<CreateAgentCommandInput, { kind: "mcp" }>;
      const snapshot = buildManagedAgent({
        id: `continuation-${counter}`,
        cwd: mcpInput.cwd,
        workspaceId: mcpInput.workspaceId,
        provider: mcpInput.provider,
        title: mcpInput.title,
        labels: mcpInput.labels,
      });
      addAgent(snapshot);
      const result: CreateAgentCommandResult = {
        snapshot,
        liveSnapshot: snapshot,
        background: true,
        initialPromptStarted: true,
        initialPromptError: null,
      };
      return result;
    },
  };
}

function okResult(profileId: string, profileName: string): AgentRoutePreflightResult {
  return { profileId, profileName, ok: true, reason: null, detail: null };
}

function failResult(
  profileId: string,
  profileName: string | null,
  reason: NonNullable<AgentRoutePreflightResult["reason"]>,
): AgentRoutePreflightResult {
  return { profileId, profileName, ok: false, reason, detail: `${reason} detail` };
}

function fakePreflight(
  resultsByEntryIndex: Record<number, AgentRoutePreflightResult>,
): AgentRoutePreflight {
  return {
    checkEntry: async (_route, index) =>
      resultsByEntryIndex[index] ?? failResult("unknown", null, "profile_missing"),
    checkRoute: async () => Object.values(resultsByEntryIndex),
  };
}

interface FakeHandoff {
  handoff: RouteHandoffSource;
  buildPacketCalls: Array<{ agentId: string; reason: string; fromLabel: string }>;
  events: Array<{ threadId: string; event: AgentRouteEvent }>;
}

function createFakeHandoff(): FakeHandoff {
  const buildPacketCalls: FakeHandoff["buildPacketCalls"] = [];
  const events: FakeHandoff["events"] = [];
  return {
    buildPacketCalls,
    events,
    handoff: {
      buildPacket: async (input) => {
        buildPacketCalls.push(input);
        return `<handoff from="${input.fromLabel}" reason="${input.reason}">packet</handoff>`;
      },
      appendEvent: async (threadId, event) => {
        events.push({ threadId, event });
      },
    },
  };
}

interface Harness {
  deps: AgentRouteServiceDeps;
  fakeAgentManager: FakeAgentManager;
  fakeCreateAgent: FakeCreateAgent;
  fakeHandoff: FakeHandoff;
  sendPromptCalls: Array<{ agentId: string; prompt: string }>;
  notifyCalls: Array<{ agentId: string; message: string; level?: string }>;
}

function createHarness(options: {
  agents: ManagedAgent[];
  preflightResults: Record<number, AgentRoutePreflightResult>;
  config?: AgentRouteDaemonConfig;
}): Harness {
  const fakeAgentManager = createFakeAgentManager(options.agents);
  const fakeCreateAgent = createFakeCreateAgent(fakeAgentManager.addAgent);
  const fakeHandoff = createFakeHandoff();
  const sendPromptCalls: Harness["sendPromptCalls"] = [];
  const notifyCalls: Harness["notifyCalls"] = [];
  const deps: AgentRouteServiceDeps = {
    agentManager: fakeAgentManager.agentManager,
    createAgent: fakeCreateAgent.createAgent,
    sendPrompt: async (agentId, prompt) => {
      sendPromptCalls.push({ agentId, prompt });
    },
    appendNotification: async (agentId, message, level) => {
      notifyCalls.push({ agentId, message, level });
    },
    preflight: fakePreflight(options.preflightResults),
    readDaemonConfig: () => options.config ?? CONFIG,
    handoff: fakeHandoff.handoff,
    logger: createTestLogger(),
  };
  return { deps, fakeAgentManager, fakeCreateAgent, fakeHandoff, sendPromptCalls, notifyCalls };
}

describe("AgentRouteService.start", () => {
  it("subscribes to AgentManager once and routes a classified failure to handleAgentManagerEvent", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    service.start();
    service.start(); // idempotent: must not subscribe a second time

    expect(harness.fakeAgentManager.subscribeCalls.count).toBe(1);

    harness.fakeAgentManager.trigger(turnFailedEvent("agent-1", "connect ECONNREFUSED"));
    await flush();

    expect(harness.fakeCreateAgent.calls).toHaveLength(1);
  });

  it("stop() unsubscribes so a later event is no longer handled", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);
    service.start();
    service.stop();

    harness.fakeAgentManager.trigger(turnFailedEvent("agent-1", "connect ECONNREFUSED"));
    await flush();

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
  });
});

describe("AgentRouteService.continueThread", () => {
  it("accepts an awaiting_choice offer the same way auto failover would", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      workspaceId: "ws-1",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "0",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "awaiting_choice",
        [ROUTE_NEXT_PROFILE_LABEL]: "claude",
        [ROUTE_REASON_LABEL]: "quota",
      },
    });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    const targetAgentId = await service.continueThread("agent-1");

    expect(targetAgentId).toBe("continuation-1");
    expect(harness.fakeCreateAgent.calls).toHaveLength(1);
    const oldAgent = harness.fakeAgentManager.agentManager.getAgent("agent-1")!;
    expect(oldAgent.labels[ROUTE_STATE_LABEL]).toBe("continued");
    expect(harness.fakeHandoff.events[0]!.event).toMatchObject({
      kind: "failover",
      reason: "quota",
    });
  });

  it("throws when the offered entry is no longer usable and changes nothing", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "0",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "awaiting_choice",
        [ROUTE_NEXT_PROFILE_LABEL]: "claude",
        [ROUTE_REASON_LABEL]: "quota",
      },
    });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: failResult("claude", "Claude", "quota") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    await expect(service.continueThread("agent-1")).rejects.toThrow(/unusable/);
    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
    expect(harness.fakeAgentManager.setLabelsCalls).toHaveLength(0);
  });

  it("resumes a paused thread by preflighting from the route's first entry", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "1",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "paused",
        [ROUTE_REASON_LABEL]: "auth",
      },
    });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 0: okResult("qwen", "Qwen (Spark)") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    const targetAgentId = await service.continueThread("agent-1");

    expect(targetAgentId).toBe("continuation-1");
    const createInput = harness.fakeCreateAgent.calls[0] as Extract<
      CreateAgentCommandInput,
      { kind: "mcp" }
    >;
    expect(createInput.provider).toBe("omp");
    expect(harness.fakeHandoff.events[0]!.event).toMatchObject({ kind: "resumed", reason: "auth" });
  });

  it("throws when resuming a paused thread finds nothing usable", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "1",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "paused",
        [ROUTE_REASON_LABEL]: "auth",
      },
    });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 0: failResult("qwen", "Qwen", "unreachable") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    await expect(service.continueThread("agent-1")).rejects.toThrow(/No usable entry/);
  });

  it("throws a clear error for an agent that is active, not awaiting_choice or paused", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({ agents: [agent], preflightResults: {} });
    const service = createAgentRouteService(harness.deps);

    await expect(service.continueThread("agent-1")).rejects.toThrow(/active/);
  });

  it("throws for an agent that is not on a route", async () => {
    const agent = buildManagedAgent({ id: "agent-1" });
    const harness = createHarness({ agents: [agent], preflightResults: {} });
    const service = createAgentRouteService(harness.deps);

    await expect(service.continueThread("agent-1")).rejects.toThrow(/not on a route/);
  });

  it("throws for an unknown agent id", async () => {
    const harness = createHarness({ agents: [], preflightResults: {} });
    const service = createAgentRouteService(harness.deps);

    await expect(service.continueThread("ghost")).rejects.toThrow(/not found/);
  });

  it("rejects a second concurrent move for the same agent", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "0",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "paused",
        [ROUTE_REASON_LABEL]: "auth",
      },
    });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 0: okResult("qwen", "Qwen (Spark)") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    const first = service.continueThread("agent-1");
    const second = service.continueThread("agent-1");

    await expect(second).rejects.toThrow(/already has a route move in progress/);
    await first;
  });
});

describe("AgentRouteService.switchBack", () => {
  function continuationAndOriginal(continuationLifecycle: ManagedAgent["lifecycle"] = "idle"): {
    continuation: ManagedAgent;
    original: ManagedAgent;
  } {
    const original = buildManagedAgent({
      id: "agent-1",
      workspaceId: "ws-1",
      lifecycle: "idle",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "0",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "continued",
        [ROUTE_CONTINUED_BY_LABEL]: "agent-2",
      },
    });
    const continuation = buildManagedAgent({
      id: "agent-2",
      lifecycle: continuationLifecycle,
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "1",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_CONTINUES_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "active",
      },
    });
    return { continuation, original };
  }

  it("sends the continuation's work back to the original agent and flips both states", async () => {
    const { continuation, original } = continuationAndOriginal();
    const harness = createHarness({
      agents: [original, continuation],
      preflightResults: { 0: okResult("qwen", "Qwen (Spark)") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    const targetAgentId = await service.switchBack("agent-2");

    expect(targetAgentId).toBe("agent-1");
    expect(harness.sendPromptCalls).toEqual([
      { agentId: "agent-1", prompt: expect.stringContaining("packet") },
    ]);
    const updatedOriginal = harness.fakeAgentManager.agentManager.getAgent("agent-1")!;
    const updatedContinuation = harness.fakeAgentManager.agentManager.getAgent("agent-2")!;
    expect(updatedOriginal.labels[ROUTE_STATE_LABEL]).toBe("active");
    expect(updatedContinuation.labels[ROUTE_STATE_LABEL]).toBe("continued");
    expect(updatedContinuation.labels[ROUTE_CONTINUED_BY_LABEL]).toBe("agent-1");
    expect(updatedContinuation.labels[ROUTE_REASON_LABEL]).toBe("manual");
    expect(harness.fakeHandoff.events[0]!.event).toMatchObject({
      kind: "switch_back",
      fromAgentId: "agent-2",
      toAgentId: "agent-1",
      reason: "manual",
    });
  });

  it("loads the original agent when it is not in memory, e.g. after a daemon restart", async () => {
    const { continuation, original } = continuationAndOriginal();
    const harness = createHarness({
      agents: [continuation],
      preflightResults: { 0: okResult("qwen", "Qwen (Spark)") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const loaded: string[] = [];
    const service = createAgentRouteService({
      ...harness.deps,
      loadAgent: async (agentId) => {
        loaded.push(agentId);
        if (agentId !== original.id) return null;
        harness.fakeAgentManager.addAgent(original);
        return original;
      },
    });

    await expect(service.switchBack("agent-2")).resolves.toBe("agent-1");
    expect(loaded).toEqual(["agent-1"]);
    expect(harness.sendPromptCalls).toEqual([
      { agentId: "agent-1", prompt: expect.stringContaining("packet") },
    ]);
  });

  it("throws when the continuation agent is not idle", async () => {
    const { continuation, original } = continuationAndOriginal("running");
    const harness = createHarness({
      agents: [original, continuation],
      preflightResults: { 0: okResult("qwen", "Qwen (Spark)") },
    });
    const service = createAgentRouteService(harness.deps);

    await expect(service.switchBack("agent-2")).rejects.toThrow(/idle/);
    expect(harness.sendPromptCalls).toHaveLength(0);
  });

  it("throws when the agent is not a route continuation", async () => {
    const agent = buildManagedAgent({ id: "agent-2", lifecycle: "idle" });
    const harness = createHarness({ agents: [agent], preflightResults: {} });
    const service = createAgentRouteService(harness.deps);

    await expect(service.switchBack("agent-2")).rejects.toThrow(/not a route continuation/);
  });

  it("throws when the original entry is still unusable and changes nothing", async () => {
    const { continuation, original } = continuationAndOriginal();
    const harness = createHarness({
      agents: [original, continuation],
      preflightResults: { 0: failResult("qwen", "Qwen (Spark)", "unreachable") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    await expect(service.switchBack("agent-2")).rejects.toThrow(/unusable/);
    expect(harness.sendPromptCalls).toHaveLength(0);
    expect(harness.fakeAgentManager.setLabelsCalls).toHaveLength(0);
  });

  it("throws when the continued agent no longer exists", async () => {
    const { continuation } = continuationAndOriginal();
    const harness = createHarness({ agents: [continuation], preflightResults: {} });
    const service = createAgentRouteService(harness.deps);

    await expect(service.switchBack("agent-2")).rejects.toThrow(/no longer exists/);
  });
});

describe("AgentRouteService.resolveForCreate", () => {
  it("returns the first usable entry's index and profile", async () => {
    const harness = createHarness({
      agents: [],
      preflightResults: {
        0: failResult("qwen", "Qwen (Spark)", "unreachable"),
        1: okResult("claude", "Claude"),
      },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    const resolution = await service.resolveForCreate("worker");

    expect(resolution).toEqual({ entryIndex: 1, profile: PROFILE_CLAUDE });
  });

  it("throws listing every entry's preflight reason when none is usable", async () => {
    const harness = createHarness({
      agents: [],
      preflightResults: {
        0: failResult("qwen", "Qwen (Spark)", "unreachable"),
        1: failResult("claude", "Claude", "provider_unavailable"),
        2: failResult("codex-a", "Codex (personal)", "signed_out"),
      },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    await expect(service.resolveForCreate("worker")).rejects.toThrow(
      /Qwen \(Spark\).*unreachable.*Claude.*provider_unavailable.*Codex \(personal\).*signed_out/s,
    );
  });

  it("throws for an unknown route id", async () => {
    const harness = createHarness({ agents: [], preflightResults: {} });
    const service = createAgentRouteService(harness.deps);

    await expect(service.resolveForCreate("ghost")).rejects.toThrow(/not found/);
  });
});

describe("AgentRouteService.preflight", () => {
  it("delegates to the injected preflight port's checkRoute", async () => {
    const results = { 0: okResult("qwen", "Qwen (Spark)") };
    const harness = createHarness({
      agents: [],
      preflightResults: results,
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const service = createAgentRouteService(harness.deps);

    await expect(service.preflight("worker")).resolves.toEqual(Object.values(results));
  });
});

/**
 * Lets fire-and-forget event handling (`void handleAgentManagerEvent(...)`, started from the
 * `start()` subscription) settle. A macrotask tick drains every pending microtask ahead of it,
 * regardless of how many `await` steps the handler's promise chain has.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
