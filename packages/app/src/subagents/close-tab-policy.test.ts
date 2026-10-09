import { describe, expect, it } from "vitest";
import { resolveCloseAgentConfirmation, resolveCloseAgentTabPolicy } from "./close-tab-policy";

describe("resolveCloseAgentTabPolicy", () => {
  it("archives root agents when their tab closes", () => {
    expect(resolveCloseAgentTabPolicy({ parentAgentId: null })).toEqual({
      kind: "archive-on-close",
    });
  });

  it("keeps subagent tab close layout-only", () => {
    expect(resolveCloseAgentTabPolicy({ parentAgentId: "parent-agent" })).toEqual({
      kind: "layout-only",
    });
  });

  it("preserves the existing archive fallback when the agent is missing", () => {
    expect(resolveCloseAgentTabPolicy(null)).toEqual({ kind: "archive-on-close" });
    expect(resolveCloseAgentTabPolicy(undefined)).toEqual({ kind: "archive-on-close" });
  });
});

describe("resolveCloseAgentConfirmation", () => {
  it("always asks before a root agent's tab close archives it", () => {
    expect(resolveCloseAgentConfirmation({ parentAgentId: null, status: "idle" })).toBe("archive");
    expect(resolveCloseAgentConfirmation({ parentAgentId: null, status: "error" })).toBe("archive");
  });

  it("warns that archiving stops a running root agent", () => {
    expect(resolveCloseAgentConfirmation({ parentAgentId: null, status: "running" })).toBe(
      "archive-running",
    );
  });

  it("never asks for a subagent, running or not", () => {
    expect(resolveCloseAgentConfirmation({ parentAgentId: "parent", status: "idle" })).toBe("none");
    expect(resolveCloseAgentConfirmation({ parentAgentId: "parent", status: "running" })).toBe(
      "none",
    );
  });

  it("asks when the agent is not in the store, matching the archive fallback", () => {
    expect(resolveCloseAgentConfirmation(null)).toBe("archive");
    expect(resolveCloseAgentConfirmation(undefined)).toBe("archive");
  });
});
