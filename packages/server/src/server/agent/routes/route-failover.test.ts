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
import type { AgentRouteServiceDeps } from "./route-service.js";
import { handleAgentManagerEvent } from "./route-failover.js";
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
const ROUTE_ASK = buildRoute({
  failover: "ask",
  entries: [{ profileId: "qwen" }, { profileId: "claude" }, { profileId: "codex-a" }],
});

function buildManagedAgent(overrides: {
  id: string;
  cwd?: string;
  workspaceId?: string;
  provider?: string;
  title?: string | null;
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
    lifecycle: "idle",
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
  setLabelsCalls: Array<{ agentId: string; labels: Record<string, string> }>;
}

function createFakeAgentManager(initialAgents: ManagedAgent[]): FakeAgentManager {
  const agents = new Map(initialAgents.map((agent) => [agent.id, agent]));
  const setLabelsCalls: Array<{ agentId: string; labels: Record<string, string> }> = [];
  return {
    setLabelsCalls,
    agentManager: {
      subscribe() {
        return () => {};
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

function createFakeCreateAgent(): FakeCreateAgent {
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
      });
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
  events: Array<{ threadId: string; event: AgentRouteEvent }>;
}

function createFakeHandoff(): FakeHandoff {
  const events: FakeHandoff["events"] = [];
  return {
    events,
    handoff: {
      buildPacket: async (input) =>
        `<handoff from="${input.fromLabel}" reason="${input.reason}">packet</handoff>`,
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
  notifyCalls: Array<{ agentId: string; message: string; level?: string }>;
}

function createHarness(options: {
  agents: ManagedAgent[];
  preflightResults: Record<number, AgentRoutePreflightResult>;
  config?: AgentRouteDaemonConfig;
}): Harness {
  const fakeAgentManager = createFakeAgentManager(options.agents);
  const fakeCreateAgent = createFakeCreateAgent();
  const fakeHandoff = createFakeHandoff();
  const notifyCalls: Harness["notifyCalls"] = [];
  const deps: AgentRouteServiceDeps = {
    agentManager: fakeAgentManager.agentManager,
    createAgent: fakeCreateAgent.createAgent,
    sendPrompt: async () => {},
    appendNotification: async (agentId, message, level) => {
      notifyCalls.push({ agentId, message, level });
    },
    preflight: fakePreflight(options.preflightResults),
    readDaemonConfig: () => options.config ?? CONFIG,
    handoff: fakeHandoff.handoff,
    logger: createTestLogger(),
  };
  return { deps, fakeAgentManager, fakeCreateAgent, fakeHandoff, notifyCalls };
}

describe("handleAgentManagerEvent", () => {
  it("auto failover creates a continuation on the next usable entry and marks the old agent continued", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });

    await handleAgentManagerEvent(
      harness.deps,
      new Set(),
      turnFailedEvent("agent-1", "connect ECONNREFUSED"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(1);
    const createInput = harness.fakeCreateAgent.calls[0] as Extract<
      CreateAgentCommandInput,
      { kind: "mcp" }
    >;
    expect(createInput.provider).toBe("claude");
    expect(createInput.cwd).toBe(agent.cwd);
    expect(createInput.workspaceId).toBe("ws-1");
    expect(createInput.initialPrompt).toContain("packet");
    expect(createInput.labels).toEqual({
      [ROUTE_ID_LABEL]: "worker",
      [ROUTE_ENTRY_LABEL]: "1",
      [ROUTE_THREAD_LABEL]: "agent-1",
      [ROUTE_CONTINUES_LABEL]: "agent-1",
      [ROUTE_STATE_LABEL]: "active",
    });

    const oldAgent = harness.fakeAgentManager.agentManager.getAgent("agent-1")!;
    expect(oldAgent.labels[ROUTE_STATE_LABEL]).toBe("continued");
    expect(oldAgent.labels[ROUTE_CONTINUED_BY_LABEL]).toBe("continuation-1");
    expect(oldAgent.labels[ROUTE_REASON_LABEL]).toBe("unreachable");

    expect(harness.notifyCalls.map((c) => c.agentId)).toEqual(
      expect.arrayContaining(["agent-1", "continuation-1"]),
    );
    expect(harness.fakeHandoff.events).toEqual([
      {
        threadId: "agent-1",
        event: {
          at: expect.any(String),
          kind: "failover",
          fromAgentId: "agent-1",
          toAgentId: "continuation-1",
          fromProfileId: "qwen",
          toProfileId: "claude",
          reason: "unreachable",
          detail: null,
        },
      },
    ]);
  });

  it("ask mode offers the next entry instead of failing over", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_ASK] },
    });

    await handleAgentManagerEvent(
      harness.deps,
      new Set(),
      turnFailedEvent("agent-1", "insufficient credits"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
    const oldAgent = harness.fakeAgentManager.agentManager.getAgent("agent-1")!;
    expect(oldAgent.labels[ROUTE_STATE_LABEL]).toBe("awaiting_choice");
    expect(oldAgent.labels[ROUTE_NEXT_PROFILE_LABEL]).toBe("claude");
    expect(oldAgent.labels[ROUTE_REASON_LABEL]).toBe("quota");
    expect(harness.notifyCalls).toHaveLength(1);
    expect(harness.notifyCalls[0]!.agentId).toBe("agent-1");
    expect(harness.fakeHandoff.events[0]!.event.kind).toBe("awaiting_choice");
    expect(harness.fakeHandoff.events[0]!.event.toAgentId).toBeNull();
  });

  it("pauses the agent and keeps its context when no entry is usable", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: {
        1: failResult("claude", "Claude", "provider_unavailable"),
        2: failResult("codex-a", "Codex (personal)", "signed_out"),
      },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });

    await handleAgentManagerEvent(
      harness.deps,
      new Set(),
      turnFailedEvent("agent-1", "failed to authenticate"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
    const oldAgent = harness.fakeAgentManager.agentManager.getAgent("agent-1")!;
    expect(oldAgent.labels[ROUTE_STATE_LABEL]).toBe("paused");
    expect(oldAgent.labels[ROUTE_REASON_LABEL]).toBe("auth");
    expect(harness.fakeHandoff.events[0]!.event.kind).toBe("paused");
  });

  it("leaves an ordinary, unclassified failure visible and untouched", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });

    await handleAgentManagerEvent(
      harness.deps,
      new Set(),
      turnFailedEvent("agent-1", "The model declined to continue"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
    expect(harness.fakeAgentManager.setLabelsCalls).toHaveLength(0);
    expect(harness.fakeHandoff.events).toHaveLength(0);
  });

  it("ignores a turn_failed event for an agent that is not on a route", async () => {
    const agent = buildManagedAgent({ id: "agent-1" });
    const harness = createHarness({ agents: [agent], preflightResults: {} });

    await handleAgentManagerEvent(
      harness.deps,
      new Set(),
      turnFailedEvent("agent-1", "connect ECONNREFUSED"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
  });

  it("ignores a turn_failed event replayed for an agent no longer in the active state", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      labels: {
        [ROUTE_ID_LABEL]: "worker",
        [ROUTE_ENTRY_LABEL]: "0",
        [ROUTE_THREAD_LABEL]: "agent-1",
        [ROUTE_STATE_LABEL]: "paused",
      },
    });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
    });

    await handleAgentManagerEvent(
      harness.deps,
      new Set(),
      turnFailedEvent("agent-1", "connect ECONNREFUSED"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
    expect(harness.fakeAgentManager.setLabelsCalls).toHaveLength(0);
  });

  it("never starts a second move for the same agent while one is already in flight", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: { 1: okResult("claude", "Claude") },
      config: { ...CONFIG, agentRoutes: [ROUTE_AUTO] },
    });
    const busyAgentIds = new Set<string>(["agent-1"]);

    await handleAgentManagerEvent(
      harness.deps,
      busyAgentIds,
      turnFailedEvent("agent-1", "connect ECONNREFUSED"),
    );

    expect(harness.fakeCreateAgent.calls).toHaveLength(0);
  });

  it("clears the busy marker after handling, even on failure", async () => {
    const agent = activeAgent({ id: "agent-1", entryIndex: 0 });
    const harness = createHarness({
      agents: [agent],
      preflightResults: {},
      config: { ...CONFIG, agentRoutes: [] },
    });
    const busyAgentIds = new Set<string>();

    // No route named "worker" in config: requireRoute throws inside the try block.
    await handleAgentManagerEvent(
      harness.deps,
      busyAgentIds,
      turnFailedEvent("agent-1", "connect ECONNREFUSED"),
    );

    expect(busyAgentIds.has("agent-1")).toBe(false);
  });
});
