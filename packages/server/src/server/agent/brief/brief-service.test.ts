import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type pino from "pino";
import type { AgentBrief } from "@getpaseo/protocol/agent-route";
import type { AgentManager, AgentManagerEvent, ManagedAgent } from "../agent-manager.js";
import type { AgentTimelineFetchResult } from "../agent-timeline-store-types.js";
import type { ProjectedTimelineRow } from "../timeline-projection.js";
import type { AgentTimelineItem } from "../agent-sdk-types.js";
import type {
  AgentBriefDaemonConfig,
  AgentBriefGenerationInput,
  AgentBriefGenerator,
} from "./brief-generator.js";
import { createAgentBriefService } from "./brief-service.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";

function buildFetchResult(items: AgentTimelineItem[]): AgentTimelineFetchResult {
  const rows: ProjectedTimelineRow[] = items.map((item, index) => ({
    seq: index + 1,
    timestamp: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    item,
    seqStart: index + 1,
    seqEnd: index + 1,
  }));
  return {
    epoch: "epoch-1",
    direction: "tail",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: 0, maxSeq: rows.length, nextSeq: rows.length + 1 },
    hasOlder: false,
    hasNewer: false,
    startSeq: rows.length > 0 ? rows[0]!.seq : null,
    endSeq: rows.length > 0 ? rows[rows.length - 1]!.seq : null,
    rows,
  };
}

function userMessage(text: string): AgentTimelineItem {
  return { type: "user_message", text };
}

function buildManagedAgent(overrides: {
  id?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  labels?: Record<string, string>;
}): ManagedAgent {
  // A real, existing directory: `git`'s child process rejects with a confusing ENOENT when its
  // cwd does not exist (Node's spawn ENOENT conflates "binary not found" and "cwd missing").
  const cwd = overrides.cwd ?? os.tmpdir();
  const provider = overrides.provider ?? "claude";
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: overrides.id ?? "agent-1",
    provider,
    cwd,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    config: { provider, cwd, model: overrides.model },
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

function turnCompletedEvent(agentId: string): AgentManagerEvent {
  return {
    type: "agent_stream",
    agentId,
    event: { type: "turn_completed", provider: "claude" },
  };
}

function createFakeAgentManager(options: {
  agents: Record<string, ManagedAgent>;
  timelines?: Record<string, AgentTimelineFetchResult>;
}): {
  agentManager: Pick<AgentManager, "subscribe" | "getAgent" | "fetchTimeline">;
  trigger: (event: AgentManagerEvent) => unknown;
  subscribeCalls: { count: number };
} {
  let subscriber: ((event: AgentManagerEvent) => unknown) | null = null;
  const subscribeCalls = { count: 0 };
  return {
    subscribeCalls,
    trigger: (event) => subscriber?.(event),
    agentManager: {
      subscribe(callback) {
        subscribeCalls.count += 1;
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      },
      getAgent(id) {
        return options.agents[id] ?? null;
      },
      fetchTimeline(id) {
        return options.timelines?.[id] ?? buildFetchResult([]);
      },
    },
  };
}

function buildGeneratedBrief(threadId: string, overrides: Partial<AgentBrief> = {}): AgentBrief {
  return {
    threadId,
    goal: "Generated goal",
    state: "Generated state",
    decisions: [],
    openItems: [],
    files: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createFakeGenerator(
  buildBrief: (input: AgentBriefGenerationInput) => AgentBrief | Promise<AgentBrief>,
): { generator: AgentBriefGenerator; calls: AgentBriefGenerationInput[] } {
  const calls: AgentBriefGenerationInput[] = [];
  return {
    calls,
    generator: {
      async regenerate(input) {
        calls.push(input);
        return buildBrief(input);
      },
    },
  };
}

function createEchoGenerator(overrides: Partial<AgentBrief> = {}): {
  generator: AgentBriefGenerator;
  calls: AgentBriefGenerationInput[];
} {
  return createFakeGenerator((input) => buildGeneratedBrief(input.threadId, overrides));
}

const emptyDaemonConfig: AgentBriefDaemonConfig = {
  agentProfiles: [],
  agentRoutes: [],
  metadataGeneration: { providers: [] },
};

describe("AgentBriefService", () => {
  let paseoHome: string;

  beforeEach(async () => {
    paseoHome = await fs.mkdtemp(path.join(os.tmpdir(), "agent-brief-service-"));
  });

  afterEach(async () => {
    await fs.rm(paseoHome, { recursive: true, force: true });
  });

  function createService(deps: {
    agentManager: Pick<AgentManager, "subscribe" | "getAgent" | "fetchTimeline">;
    generator: AgentBriefGenerator;
    logger?: pino.Logger;
  }) {
    return createAgentBriefService({
      agentManager: deps.agentManager,
      readDaemonConfig: () => emptyDaemonConfig,
      paseoHome,
      generator: deps.generator,
      logger: deps.logger ?? createTestLogger(),
    });
  }

  it("returns an empty brief and a manual handoff preview for a non-routed agent", async () => {
    const agent = buildManagedAgent({
      id: "agent-1",
      provider: "claude",
      model: "claude-sonnet-5",
    });
    const { agentManager } = createFakeAgentManager({ agents: { "agent-1": agent } });
    const { generator } = createEchoGenerator();
    const service = createService({ agentManager, generator });

    const view = await service.get("agent-1");

    expect(view.brief).toBeNull();
    expect(view.events).toEqual([]);
    expect(view.handoffPreview).toContain(
      '<handoff from="claude (claude-sonnet-5)" reason="manual">',
    );
  });

  it("rejects when the agent does not exist", async () => {
    const { agentManager } = createFakeAgentManager({ agents: {} });
    const { generator } = createEchoGenerator();
    const service = createService({ agentManager, generator });

    await expect(service.get("missing")).rejects.toThrow("Agent not found: missing");
  });

  it("refresh regenerates before returning the brief, and the result is persisted", async () => {
    const agent = buildManagedAgent({ id: "agent-1" });
    const { agentManager } = createFakeAgentManager({ agents: { "agent-1": agent } });
    const { generator, calls } = createFakeGenerator((input) =>
      buildGeneratedBrief(input.threadId, { goal: "Fresh goal" }),
    );
    const service = createService({ agentManager, generator });

    const view = await service.get("agent-1", { refresh: true });

    expect(calls).toHaveLength(1);
    expect(view.brief).toMatchObject({ goal: "Fresh goal" });

    const second = await service.get("agent-1");
    expect(second.brief).toMatchObject({ goal: "Fresh goal" });
    expect(calls).toHaveLength(1);
  });

  it("update stores the edit with editedByUser true, and it persists", async () => {
    const agent = buildManagedAgent({ id: "agent-1" });
    const { agentManager } = createFakeAgentManager({ agents: { "agent-1": agent } });
    const { generator } = createEchoGenerator();
    const service = createService({ agentManager, generator });

    const edited = await service.update("agent-1", {
      goal: "User goal",
      state: "User state",
      decisions: ["d1"],
      openItems: ["o1"],
      files: ["f1"],
    });

    expect(edited).toMatchObject({ goal: "User goal", editedByUser: true, threadId: "agent-1" });
    const view = await service.get("agent-1");
    expect(view.brief).toMatchObject({ goal: "User goal", editedByUser: true });
  });

  it("appendEvent persists route events visible through get", async () => {
    const agent = buildManagedAgent({ id: "agent-1" });
    const { agentManager } = createFakeAgentManager({ agents: { "agent-1": agent } });
    const { generator } = createEchoGenerator();
    const service = createService({ agentManager, generator });

    await service.appendEvent("agent-1", {
      at: "2026-01-01T00:00:00.000Z",
      kind: "paused",
      fromAgentId: "agent-1",
      toAgentId: null,
      fromProfileId: null,
      toProfileId: null,
      reason: "quota",
      detail: null,
    });

    const view = await service.get("agent-1");
    expect(view.events).toHaveLength(1);
    expect(view.events[0]).toMatchObject({ kind: "paused", reason: "quota" });
  });

  it("buildPacket reads the original request from the thread's first agent and the rest from the given agent", async () => {
    const firstAgent = buildManagedAgent({
      id: "thread-1",
      labels: { "stroll.route": "worker", "stroll.route.thread": "thread-1" },
    });
    const continuationAgent = buildManagedAgent({
      id: "agent-2",
      labels: { "stroll.route": "worker", "stroll.route.thread": "thread-1" },
    });
    const { agentManager } = createFakeAgentManager({
      agents: { "thread-1": firstAgent, "agent-2": continuationAgent },
      timelines: {
        "thread-1": buildFetchResult([userMessage("Original ask")]),
        "agent-2": buildFetchResult([userMessage("Latest from the continuation")]),
      },
    });
    const { generator } = createEchoGenerator();
    const service = createService({ agentManager, generator });

    const packet = await service.buildPacket({
      agentId: "agent-2",
      reason: "unreachable",
      fromLabel: "Qwen (Spark)",
    });

    expect(packet).toContain('<handoff from="Qwen (Spark)" reason="unreachable">');
    expect(packet).toContain("## Original request\nOriginal ask");
    expect(packet).toContain("## Latest user message\nLatest from the continuation");
  });

  describe("start", () => {
    it("subscribes once and is idempotent", () => {
      const { agentManager, subscribeCalls } = createFakeAgentManager({ agents: {} });
      const { generator } = createEchoGenerator();
      const service = createService({ agentManager, generator });

      service.start();
      service.start();

      expect(subscribeCalls.count).toBe(1);
    });

    it("ignores events that are not a completed turn", async () => {
      const agent = buildManagedAgent({ id: "agent-1", labels: { "stroll.route": "worker" } });
      const { agentManager, trigger } = createFakeAgentManager({ agents: { "agent-1": agent } });
      const { generator, calls } = createEchoGenerator();
      const service = createService({ agentManager, generator });
      service.start();

      await trigger({
        type: "agent_stream",
        agentId: "agent-1",
        event: { type: "turn_started", provider: "claude" },
      });

      expect(calls).toHaveLength(0);
    });

    it("ignores a completed turn for an agent that is not routed", async () => {
      const agent = buildManagedAgent({ id: "agent-1", labels: {} });
      const { agentManager, trigger } = createFakeAgentManager({ agents: { "agent-1": agent } });
      const { generator, calls } = createEchoGenerator();
      const service = createService({ agentManager, generator });
      service.start();

      await trigger(turnCompletedEvent("agent-1"));

      expect(calls).toHaveLength(0);
    });

    it("ignores a completed turn for an unknown agent", async () => {
      const { agentManager, trigger } = createFakeAgentManager({ agents: {} });
      const { generator, calls } = createEchoGenerator();
      const service = createService({ agentManager, generator });
      service.start();

      await trigger(turnCompletedEvent("ghost-agent"));

      expect(calls).toHaveLength(0);
    });

    it("regenerates the thread's brief, keyed by stroll.route.thread, for a routed agent", async () => {
      const threadLabels = { "stroll.route": "worker", "stroll.route.thread": "thread-1" };
      const firstAgent = buildManagedAgent({ id: "thread-1", labels: threadLabels });
      const agent = buildManagedAgent({ id: "agent-2", labels: threadLabels });
      const { agentManager, trigger } = createFakeAgentManager({
        agents: { "thread-1": firstAgent, "agent-2": agent },
      });
      const { generator, calls } = createEchoGenerator({ goal: "Auto-generated" });
      const service = createService({ agentManager, generator });
      service.start();

      await trigger(turnCompletedEvent("agent-2"));

      expect(calls).toHaveLength(1);
      expect(calls[0]?.threadId).toBe("thread-1");

      const view = await service.get("thread-1");
      expect(view.brief).toMatchObject({ goal: "Auto-generated", threadId: "thread-1" });
    });

    it("falls back to the agent id as the thread id when stroll.route.thread is absent", async () => {
      const agent = buildManagedAgent({ id: "agent-3", labels: { "stroll.route": "worker" } });
      const { agentManager, trigger } = createFakeAgentManager({ agents: { "agent-3": agent } });
      const { generator, calls } = createEchoGenerator();
      const service = createService({ agentManager, generator });
      service.start();

      await trigger(turnCompletedEvent("agent-3"));

      expect(calls[0]?.threadId).toBe("agent-3");
    });

    it("logs and does not throw when regeneration fails", async () => {
      const warnings: Array<{ obj: object; msg?: string }> = [];
      const fakeLogger = {
        warn: (obj: object, msg?: string) => {
          warnings.push({ obj, msg });
        },
      } as unknown as pino.Logger;
      const agent = buildManagedAgent({
        id: "agent-1",
        labels: { "stroll.route": "worker", "stroll.route.thread": "thread-1" },
      });
      const { agentManager, trigger } = createFakeAgentManager({ agents: { "agent-1": agent } });
      const generator: AgentBriefGenerator = {
        async regenerate() {
          throw new Error("provider unavailable");
        },
      };
      const service = createService({ agentManager, generator, logger: fakeLogger });
      service.start();

      await trigger(turnCompletedEvent("agent-1"));

      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.msg).toContain("Agent brief regeneration failed");
    });

    it("coalesces completions that arrive while a generation is in flight into exactly one more run", async () => {
      const threadLabel = { "stroll.route": "worker", "stroll.route.thread": "thread-1" };
      const agentA = buildManagedAgent({ id: "agent-a", labels: threadLabel });
      const agentB = buildManagedAgent({ id: "agent-b", labels: threadLabel });
      const agentC = buildManagedAgent({ id: "agent-c", labels: threadLabel });
      const { agentManager, trigger } = createFakeAgentManager({
        agents: { "agent-a": agentA, "agent-b": agentB, "agent-c": agentC },
      });

      const callOrder: string[] = [];
      let releaseFirstCall: (() => void) | null = null;
      const firstCallGate = new Promise<void>((resolve) => {
        releaseFirstCall = resolve;
      });
      const generator: AgentBriefGenerator = {
        async regenerate(input) {
          callOrder.push(input.agent.id);
          if (callOrder.length === 1) {
            await firstCallGate;
          }
          return buildGeneratedBrief(input.threadId);
        },
      };
      const service = createService({ agentManager, generator });
      service.start();

      // Scheduling is synchronous (docs/agent-routes.md: "never two generations per thread at
      // once"), so firing all three back to back deterministically exercises "A is running, B
      // then C both land in the single queued slot" without waiting on real I/O timing.
      const pendingA = trigger(turnCompletedEvent("agent-a"));
      const pendingB = trigger(turnCompletedEvent("agent-b"));
      const pendingC = trigger(turnCompletedEvent("agent-c"));

      releaseFirstCall?.();
      await Promise.all([pendingA, pendingB, pendingC]);

      expect(callOrder).toEqual(["agent-a", "agent-c"]);
    });
  });
});
