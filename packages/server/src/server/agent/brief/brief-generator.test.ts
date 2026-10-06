import { describe, expect, it } from "vitest";
import type { AgentBrief, AgentBriefEdit, AgentRoute } from "@getpaseo/protocol/agent-route";
import type { ManagedAgent } from "../agent-manager.js";
import type { AgentTimelineFetchResult } from "../agent-timeline-store-types.js";
import type { ProjectedTimelineRow } from "../timeline-projection.js";
import type { AgentTimelineItem, ProviderSnapshotEntry } from "../agent-sdk-types.js";
import {
  buildBriefGenerationPrompt,
  capActivityText,
  createAgentBriefGenerator,
  resolveBriefGenerationProviders,
  type AgentBriefDaemonConfig,
  type BriefStructuredGeneration,
  type BriefStructuredGenerationRequest,
} from "./brief-generator.js";

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

function buildAgent(
  overrides: {
    id?: string;
    cwd?: string;
    provider?: string;
    model?: string;
    thinkingOptionId?: string;
    labels?: Record<string, string>;
  } = {},
): Pick<ManagedAgent, "id" | "cwd" | "config" | "labels"> {
  const cwd = overrides.cwd ?? "/tmp/project";
  const provider = overrides.provider ?? "qwen";
  return {
    id: overrides.id ?? "agent-1",
    cwd,
    labels: overrides.labels ?? {},
    config: {
      provider,
      cwd,
      model: overrides.model,
      thinkingOptionId: overrides.thinkingOptionId,
    },
  };
}

function buildPreviousBrief(overrides: Partial<AgentBrief> = {}): AgentBrief {
  return {
    threadId: "thread-1",
    goal: "Ship the feature",
    state: "Implementing",
    decisions: ["Use atomic writes"],
    openItems: ["Write tests"],
    files: ["brief-generator.ts"],
    updatedAt: "2026-01-01T00:00:03.000Z",
    ...overrides,
  };
}

describe("buildBriefGenerationPrompt", () => {
  it("marks the previous brief as absent on the first generation", () => {
    const prompt = buildBriefGenerationPrompt({ previousBrief: null, activity: "did stuff" });
    expect(prompt).toContain(
      "## Previous brief\n(none yet — this is the first brief for this thread)",
    );
  });

  it("includes every previous brief field", () => {
    const prompt = buildBriefGenerationPrompt({
      previousBrief: buildPreviousBrief(),
      activity: "did more stuff",
    });
    expect(prompt).toContain("Goal: Ship the feature");
    expect(prompt).toContain("State: Implementing");
    expect(prompt).toContain("Decisions: Use atomic writes");
    expect(prompt).toContain("Open items: Write tests");
    expect(prompt).toContain("Files: brief-generator.ts");
  });

  it("marks empty previous-brief lists as none", () => {
    const prompt = buildBriefGenerationPrompt({
      previousBrief: buildPreviousBrief({ decisions: [], openItems: [], files: [] }),
      activity: "x",
    });
    expect(prompt).toContain("Decisions: (none)");
    expect(prompt).toContain("Open items: (none)");
    expect(prompt).toContain("Files: (none)");
  });

  it("includes the curated activity verbatim", () => {
    const prompt = buildBriefGenerationPrompt({
      previousBrief: null,
      activity: "[User] do the thing",
    });
    expect(prompt).toContain("## Activity since the last update\n[User] do the thing");
  });

  it("marks blank activity as none", () => {
    const prompt = buildBriefGenerationPrompt({ previousBrief: null, activity: "   " });
    expect(prompt).toContain("## Activity since the last update\n(no new activity)");
  });
});

describe("capActivityText", () => {
  it("returns text under the limit unchanged", () => {
    expect(capActivityText("short", 100)).toBe("short");
  });

  it("truncates from the start, keeping the most recent activity", () => {
    const text = "0123456789";
    const capped = capActivityText(text, 4);
    expect(capped).toBe("(earlier activity truncated)\n6789");
  });
});

describe("createAgentBriefGenerator", () => {
  it("passes the agent's provider, model, and route id through to generation", async () => {
    const requests: BriefStructuredGenerationRequest<unknown>[] = [];
    const generation: BriefStructuredGeneration = {
      async generate<T>(request: BriefStructuredGenerationRequest<T>) {
        requests.push(request as BriefStructuredGenerationRequest<unknown>);
        const edit: AgentBriefEdit = {
          goal: "Updated goal",
          state: "Updated state",
          decisions: ["New decision"],
          openItems: [],
          files: ["a.ts"],
        };
        return edit as unknown as T;
      },
    };
    const agent = buildAgent({
      provider: "qwen",
      model: "spark-a/qwen3.8-flash-next",
      thinkingOptionId: "low",
      labels: { "stroll.route": "worker" },
    });
    const generator = createAgentBriefGenerator({
      agentManager: { fetchTimeline: () => buildFetchResult([userMessage("hello")]) },
      generation,
    });

    const brief = await generator.regenerate({ agent, threadId: "thread-1", previousBrief: null });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      cwd: "/tmp/project",
      schemaName: "AgentBrief",
      provider: "qwen",
      model: "spark-a/qwen3.8-flash-next",
      thinkingOptionId: "low",
      routeId: "worker",
    });
    expect(brief).toMatchObject({
      threadId: "thread-1",
      goal: "Updated goal",
      state: "Updated state",
      decisions: ["New decision"],
      openItems: [],
      files: ["a.ts"],
    });
    expect(typeof brief.updatedAt).toBe("string");
  });

  it("has a null route id for a non-routed agent", async () => {
    const requests: BriefStructuredGenerationRequest<unknown>[] = [];
    const generation: BriefStructuredGeneration = {
      async generate<T>(request: BriefStructuredGenerationRequest<T>) {
        requests.push(request as BriefStructuredGenerationRequest<unknown>);
        return {
          goal: "g",
          state: "s",
          decisions: [],
          openItems: [],
          files: [],
        } as unknown as T;
      },
    };
    const generator = createAgentBriefGenerator({
      agentManager: { fetchTimeline: () => buildFetchResult([]) },
      generation,
    });

    await generator.regenerate({ agent: buildAgent(), threadId: "agent-1", previousBrief: null });

    expect(requests[0]?.routeId).toBeNull();
  });

  it("only feeds activity recorded after the previous brief's updatedAt into the prompt", async () => {
    const items: AgentTimelineItem[] = [
      userMessage("earlier message"),
      userMessage("earlier message"),
      userMessage("earlier message"),
      userMessage("earlier message"),
      userMessage("later message"),
    ];
    // Rows 0-3 timestamp at seconds 0-3, row 4 at second 4; previousBrief.updatedAt sits after
    // second 3, so only the last row should be curated into the prompt.
    const requests: BriefStructuredGenerationRequest<unknown>[] = [];
    const generation: BriefStructuredGeneration = {
      async generate<T>(request: BriefStructuredGenerationRequest<T>) {
        requests.push(request as BriefStructuredGenerationRequest<unknown>);
        return {
          goal: "g",
          state: "s",
          decisions: [],
          openItems: [],
          files: [],
        } as unknown as T;
      },
    };
    const generator = createAgentBriefGenerator({
      agentManager: { fetchTimeline: () => buildFetchResult(items) },
      generation,
    });

    await generator.regenerate({
      agent: buildAgent(),
      threadId: "agent-1",
      previousBrief: buildPreviousBrief({
        updatedAt: new Date(2026, 0, 1, 0, 0, 3, 500).toISOString(),
      }),
    });

    const prompt = requests[0]?.prompt as string;
    expect(prompt).toContain("[User] later message");
    expect(prompt.match(/earlier message/g)).toBeNull();
  });
});

describe("resolveBriefGenerationProviders", () => {
  const providerSnapshotManager = {
    listProviders: async (): Promise<ProviderSnapshotEntry[]> => [
      { provider: "claude", status: "ready" as const, enabled: true, models: [] },
    ],
  };

  function buildDaemonConfig(agentRoutes: AgentRoute[]): AgentBriefDaemonConfig {
    return { agentProfiles: [], agentRoutes, metadataGeneration: { providers: [] } };
  }

  it("uses only the agent's own provider on a route whose privacy resolves to local", async () => {
    let listCalled = false;
    const providers = await resolveBriefGenerationProviders({
      cwd: "/tmp/project",
      provider: "qwen",
      model: "spark-a/qwen3.8-flash-next",
      routeId: "worker",
      daemonConfig: buildDaemonConfig([
        {
          id: "worker",
          name: "Worker",
          privacy: "local",
          entries: [{ profileId: "qwen", privacy: "local" }],
        },
      ]),
      providerSnapshotManager: {
        listProviders: async () => {
          listCalled = true;
          return [];
        },
      },
    });

    expect(providers).toEqual([{ provider: "qwen", model: "spark-a/qwen3.8-flash-next" }]);
    expect(listCalled).toBe(false);
  });

  it("treats a route with no privacy field as local (the default)", async () => {
    const providers = await resolveBriefGenerationProviders({
      cwd: "/tmp/project",
      provider: "qwen",
      routeId: "worker",
      daemonConfig: buildDaemonConfig([{ id: "worker", name: "Worker", entries: [] }]),
      providerSnapshotManager,
    });

    expect(providers).toEqual([{ provider: "qwen" }]);
  });

  it("uses resolveStructuredGenerationProviders on a cloud route", async () => {
    const providers = await resolveBriefGenerationProviders({
      cwd: "/tmp/project",
      provider: "claude",
      model: "claude-sonnet-5",
      routeId: "planner",
      daemonConfig: buildDaemonConfig([
        { id: "planner", name: "Planner", privacy: "cloud", entries: [] },
      ]),
      providerSnapshotManager,
    });

    expect(providers.some((candidate) => candidate.provider === "claude")).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
  });

  it("uses only the agent's own provider for a non-routed agent", async () => {
    const providers = await resolveBriefGenerationProviders({
      cwd: "/tmp/project",
      provider: "claude",
      model: "claude-sonnet-5",
      routeId: null,
      daemonConfig: buildDaemonConfig([]),
      providerSnapshotManager,
    });

    expect(providers).toEqual([{ provider: "claude", model: "claude-sonnet-5" }]);
  });

  it("uses only the agent's own provider when the route id is unknown", async () => {
    const providers = await resolveBriefGenerationProviders({
      cwd: "/tmp/project",
      provider: "qwen",
      model: "spark-a/qwen3.8-flash-next",
      routeId: "missing-route",
      daemonConfig: buildDaemonConfig([]),
      providerSnapshotManager,
    });

    expect(providers).toEqual([{ provider: "qwen", model: "spark-a/qwen3.8-flash-next" }]);
  });
});
