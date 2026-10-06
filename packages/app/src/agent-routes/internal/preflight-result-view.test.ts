import { beforeAll, describe, expect, it } from "vitest";
import type { AgentRoutePreflightResult } from "@getpaseo/protocol/agent-route";
import { i18n } from "@/i18n/i18next";
import { toAgentRoutePreflightResultView } from "./preflight-result-view";

function buildResult(
  overrides: Partial<AgentRoutePreflightResult> = {},
): AgentRoutePreflightResult {
  return {
    profileId: "qwen",
    profileName: "Qwen (Spark)",
    ok: true,
    reason: null,
    detail: null,
    ...overrides,
  };
}

describe("toAgentRoutePreflightResultView", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("uses the profile name and no detail when the entry is usable", () => {
    expect(toAgentRoutePreflightResultView(buildResult(), i18n.t)).toEqual({
      profileId: "qwen",
      label: "Qwen (Spark)",
      ok: true,
      detail: null,
    });
  });

  it("falls back to the profile id when the server has no name for it", () => {
    const view = toAgentRoutePreflightResultView(
      buildResult({ profileName: null, profileId: "codex-a" }),
      i18n.t,
    );
    expect(view.label).toBe("codex-a");
  });

  it("renders the reason text alone when the server has no extra detail", () => {
    const view = toAgentRoutePreflightResultView(
      buildResult({ ok: false, reason: "unreachable", detail: null }),
      i18n.t,
    );
    expect(view).toEqual({
      profileId: "qwen",
      label: "Qwen (Spark)",
      ok: false,
      detail: "Not reachable",
    });
  });

  it("joins the reason text with the server's detail when both are present", () => {
    const view = toAgentRoutePreflightResultView(
      buildResult({ ok: false, reason: "quota", detail: "balance is $0.00" }),
      i18n.t,
    );
    expect(view.detail).toBe("Out of usage or credits: balance is $0.00");
  });

  it("falls back to a generic label when the server gives no reason or detail", () => {
    const view = toAgentRoutePreflightResultView(
      buildResult({ ok: false, reason: null, detail: null }),
      i18n.t,
    );
    expect(view.detail).toBe("Unavailable");
  });
});
