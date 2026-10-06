import { describe, expect, it } from "vitest";
import {
  buildManagedSubagentRowPresentation,
  buildNativeSubagentRowPresentation,
  firstLine,
  type ManagedSubagentLiveFields,
  type NativeSubagentDescriptorFields,
} from "./transcript-row-model";

const STARTED = new Date("2026-04-20T00:00:00.000Z");
const ENDED = new Date("2026-04-20T00:02:12.000Z");

function managedFields(
  overrides: Partial<ManagedSubagentLiveFields> = {},
): ManagedSubagentLiveFields {
  return {
    title: null,
    provider: "claude",
    model: "opus-5",
    routeId: null,
    isRunning: true,
    startedAt: STARTED,
    endedAt: ENDED,
    pendingPermissionCount: 0,
    isFailed: false,
    lastError: null,
    ...overrides,
  };
}

describe("firstLine", () => {
  it("returns the first line of a multi-line message", () => {
    expect(firstLine("boom\nstack trace\nmore stack")).toBe("boom");
  });

  it("trims a single-line message", () => {
    expect(firstLine("  boom  ")).toBe("boom");
  });

  it("returns null for empty, blank, or missing text", () => {
    expect(firstLine("")).toBeNull();
    expect(firstLine("   ")).toBeNull();
    expect(firstLine(null)).toBeNull();
    expect(firstLine(undefined)).toBeNull();
  });
});

describe("buildManagedSubagentRowPresentation", () => {
  it("shows a working row with no meta while the agent record has not hydrated yet", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: null,
      toolCallDescription: "Review the PR",
    });
    expect(presentation.title).toBe("Review the PR");
    expect(presentation.titleState).toBe("ready");
    expect(presentation.meta).toBe("");
    expect(presentation.statusBucket).toBe("running");
    expect(presentation.statusText).toEqual({ key: "subagents.statusWorking" });
    expect(presentation.openTarget).toEqual({ kind: "agent", agentId: "agent-1" });
  });

  it("falls back to a loading title when neither the agent nor the call named it", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: null,
      toolCallDescription: null,
    });
    expect(presentation.title).toBe("");
    expect(presentation.titleState).toBe("loading");
  });

  it("prefers the live agent's own title once it has one", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ title: "Fix the flaky test" }),
      toolCallDescription: "some initial prompt",
    });
    expect(presentation.title).toBe("Fix the flaky test");
  });

  it("falls back to the call's task description before the agent names itself", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ title: null }),
      toolCallDescription: "Fix the flaky test",
    });
    expect(presentation.title).toBe("Fix the flaky test");
  });

  it("shows the route id as meta when the agent started on a route", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ routeId: "fast-fallback", provider: "claude", model: "opus-5" }),
      toolCallDescription: null,
    });
    expect(presentation.meta).toBe("fast-fallback");
  });

  it("falls back to provider · model when there is no route", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ routeId: null, provider: "claude", model: "opus-5" }),
      toolCallDescription: null,
    });
    expect(presentation.meta).toBe("claude · opus-5");
  });

  it("drops the model from meta when it is unknown", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ routeId: null, provider: "claude", model: null }),
      toolCallDescription: null,
    });
    expect(presentation.meta).toBe("claude");
  });

  it("reports needs_input when the agent has a pending permission, even while running", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ isRunning: true, pendingPermissionCount: 1 }),
      toolCallDescription: null,
    });
    expect(presentation.statusBucket).toBe("needs_input");
    expect(presentation.statusText).toEqual({ key: "subagents.statusNeedsPermission" });
  });

  it("reports running while the agent's turn is open", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ isRunning: true }),
      toolCallDescription: null,
    });
    expect(presentation.statusBucket).toBe("running");
    expect(presentation.isRunning).toBe(true);
    expect(presentation.startedAt).toBe(STARTED);
  });

  it("reports failed with the first line of the error once errored", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({
        isRunning: false,
        isFailed: true,
        lastError: "connection reset\nat fetch (…)",
      }),
      toolCallDescription: null,
    });
    expect(presentation.statusBucket).toBe("failed");
    expect(presentation.statusText).toEqual({
      key: "subagents.statusFailed",
      params: { reason: "connection reset" },
    });
  });

  it("reports a generic failed status when the error message is unknown", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ isRunning: false, isFailed: true, lastError: null }),
      toolCallDescription: null,
    });
    expect(presentation.statusText).toEqual({ key: "subagents.statusFailedGeneric" });
  });

  it("reports done once idle and finished, with the final duration anchors", () => {
    const presentation = buildManagedSubagentRowPresentation({
      agentId: "agent-1",
      agent: managedFields({ isRunning: false, isFailed: false }),
      toolCallDescription: null,
    });
    expect(presentation.statusBucket).toBe("done");
    expect(presentation.isRunning).toBe(false);
    expect(presentation.startedAt).toBe(STARTED);
    expect(presentation.endedAt).toBe(ENDED);
  });
});

function descriptorFields(
  overrides: Partial<NativeSubagentDescriptorFields> = {},
): NativeSubagentDescriptorFields {
  return { isRunning: true, isFailed: false, startedAt: STARTED, endedAt: ENDED, ...overrides };
}

describe("buildNativeSubagentRowPresentation", () => {
  it("names the row after the task, falling back to the subagent type", () => {
    expect(
      buildNativeSubagentRowPresentation({
        provider: "claude",
        subAgentType: "general-purpose",
        description: "Summarize the docs",
        parentAgentId: "parent",
        mappedSubagentId: "toolu_1",
        descriptor: descriptorFields(),
        toolCallStatus: "running",
      }).title,
    ).toBe("Summarize the docs");

    expect(
      buildNativeSubagentRowPresentation({
        provider: "claude",
        subAgentType: "general-purpose",
        description: null,
        parentAgentId: "parent",
        mappedSubagentId: "toolu_1",
        descriptor: descriptorFields(),
        toolCallStatus: "running",
      }).title,
    ).toBe("general-purpose");
  });

  it("shows subAgentType · provider as meta", () => {
    expect(
      buildNativeSubagentRowPresentation({
        provider: "claude",
        subAgentType: "general-purpose",
        description: "Summarize the docs",
        parentAgentId: "parent",
        mappedSubagentId: "toolu_1",
        descriptor: descriptorFields(),
        toolCallStatus: "running",
      }).meta,
    ).toBe("general-purpose · claude");
  });

  it("opens a mapped subagent at the provider_subagent target", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "claude",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: "toolu_1",
      descriptor: descriptorFields(),
      toolCallStatus: "running",
    });
    expect(presentation.openTarget).toEqual({
      kind: "provider_subagent",
      parentAgentId: "parent",
      subagentId: "toolu_1",
    });
  });

  it("never offers an open target when there is no reliable mapping", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "codex",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: null,
      descriptor: null,
      toolCallStatus: "running",
    });
    expect(presentation.openTarget).toBeNull();
  });

  it("reads status and elapsed timing off the live descriptor when one is mapped", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "claude",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: "toolu_1",
      descriptor: descriptorFields({ isRunning: false, isFailed: true }),
      toolCallStatus: "running",
    });
    expect(presentation.statusBucket).toBe("failed");
    expect(presentation.isRunning).toBe(false);
    expect(presentation.startedAt).toBe(STARTED);
    expect(presentation.endedAt).toBe(ENDED);
  });

  it("falls back to the tool call's own status when there is no live descriptor", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "codex",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: null,
      descriptor: null,
      toolCallStatus: "failed",
    });
    expect(presentation.statusBucket).toBe("failed");
    expect(presentation.startedAt).toBeNull();
    expect(presentation.endedAt).toBeNull();
  });

  it("treats an executing tool call as running when unmapped", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "codex",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: null,
      descriptor: null,
      toolCallStatus: "executing",
    });
    expect(presentation.isRunning).toBe(true);
    expect(presentation.statusBucket).toBe("running");
  });

  it("treats a completed unmapped tool call as done", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "omp",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: null,
      descriptor: null,
      toolCallStatus: "completed",
    });
    expect(presentation.statusBucket).toBe("done");
  });

  it("never reports needs_input for a native row — providers surface no permission signal", () => {
    const presentation = buildNativeSubagentRowPresentation({
      provider: "claude",
      subAgentType: "general-purpose",
      description: null,
      parentAgentId: "parent",
      mappedSubagentId: "toolu_1",
      descriptor: descriptorFields({ isRunning: true }),
      toolCallStatus: "running",
    });
    expect(presentation.statusBucket).not.toBe("needs_input");
  });
});
