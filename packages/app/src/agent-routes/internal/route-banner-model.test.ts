import { beforeAll, describe, expect, it } from "vitest";
import type { AgentRouteLabels } from "@getpaseo/protocol/agent-route";
import { i18n } from "@/i18n/i18next";
import { resolveRouteBannerViewModel } from "./route-banner-model";

function buildLabels(overrides: Partial<AgentRouteLabels> = {}): AgentRouteLabels {
  return {
    routeId: "worker",
    entryIndex: 0,
    threadId: "agent-1",
    continuesAgentId: null,
    continuedByAgentId: null,
    state: "active",
    nextProfileId: null,
    reason: null,
    ...overrides,
  };
}

describe("resolveRouteBannerViewModel", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows nothing for an agent that never started on a route", () => {
    expect(
      resolveRouteBannerViewModel(
        {
          labels: null,
          nextProfileName: null,
          continuedByAgentTitle: null,
          previousAgentTitle: null,
        },
        i18n.t,
      ),
    ).toEqual({ kind: "none" });
  });

  it("shows nothing for an active agent with no continuation on either side", () => {
    expect(
      resolveRouteBannerViewModel(
        {
          labels: buildLabels({ state: "active" }),
          nextProfileName: null,
          continuedByAgentTitle: null,
          previousAgentTitle: null,
        },
        i18n.t,
      ),
    ).toEqual({ kind: "none" });
  });

  it("asks before failing over when the route is set to ask", () => {
    const view = resolveRouteBannerViewModel(
      {
        labels: buildLabels({
          state: "awaiting_choice",
          reason: "quota",
          nextProfileId: "codex-a",
        }),
        nextProfileName: "Codex (personal)",
        continuedByAgentTitle: null,
        previousAgentTitle: null,
      },
      i18n.t,
    );
    expect(view).toEqual({
      kind: "awaiting_choice",
      message: "Out of usage or credits. Continue on Codex (personal)?",
    });
  });

  it("falls back to a generic profile name when it cannot resolve the next profile", () => {
    const view = resolveRouteBannerViewModel(
      {
        labels: buildLabels({ state: "awaiting_choice", reason: "auth", nextProfileId: "codex-a" }),
        nextProfileName: null,
        continuedByAgentTitle: null,
        previousAgentTitle: null,
      },
      i18n.t,
    );
    expect(view).toEqual({
      kind: "awaiting_choice",
      message: "Signed out. Continue on another profile?",
    });
  });

  it("shows the paused banner when no entry is usable", () => {
    const view = resolveRouteBannerViewModel(
      {
        labels: buildLabels({ state: "paused", reason: "unreachable" }),
        nextProfileName: null,
        continuedByAgentTitle: null,
        previousAgentTitle: null,
      },
      i18n.t,
    );
    expect(view).toEqual({
      kind: "paused",
      message: "Paused: no model on this route is available. The context is kept.",
    });
  });

  it("shows where the thread continued once this agent handed off", () => {
    const view = resolveRouteBannerViewModel(
      {
        labels: buildLabels({ state: "continued", continuedByAgentId: "agent-2" }),
        nextProfileName: null,
        continuedByAgentTitle: "Codex (personal)",
        previousAgentTitle: null,
      },
      i18n.t,
    );
    expect(view).toEqual({
      kind: "continued",
      message: "Continued on Codex (personal)",
      continuedByAgentId: "agent-2",
    });
  });

  it("shows the continued-from banner with a reason for the active continuation agent", () => {
    const view = resolveRouteBannerViewModel(
      {
        labels: buildLabels({
          state: "active",
          continuesAgentId: "agent-1",
          reason: "unreachable",
        }),
        nextProfileName: null,
        continuedByAgentTitle: null,
        previousAgentTitle: "Qwen (Spark)",
      },
      i18n.t,
    );
    expect(view).toEqual({
      kind: "continued_from",
      message: "Continued from Qwen (Spark) — Not reachable",
    });
  });

  it("drops the reason clause when the continuation has none", () => {
    const view = resolveRouteBannerViewModel(
      {
        labels: buildLabels({ state: "active", continuesAgentId: "agent-1", reason: null }),
        nextProfileName: null,
        continuedByAgentTitle: null,
        previousAgentTitle: "Qwen (Spark)",
      },
      i18n.t,
    );
    expect(view).toEqual({
      kind: "continued_from",
      message: "Continued from Qwen (Spark)",
    });
  });
});
